import "server-only";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { lerCnab240Extrato, loteDaConta, pareceCnab240 } from "./cnab240-extrato";
import { garantirMesAberto } from "./fechamento";
import { lerOfx } from "./ofx";
import { validarClassificacao } from "./plano";
import { FinanceiroError, registrarBaixa } from "./titulos";

/** Regras de conciliação bancária que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */
const cent = (n: number) => Math.round(n * 100);

/**
 * Importa o extrato (OFX ou CNAB 240 do Itaú, já decodificado em texto) numa conta. Linhas já importadas são ignoradas.
 * OFX e CNAB identificam o mesmo lançamento de jeitos diferentes: misturar os dois no mesmo período duplicaria o extrato.
 */
export async function importarExtratoTexto(contaId: string, texto: string) {
  const conta = await db.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true, agencia: true, numero: true } });
  if (!conta?.ativo) throw new ErroNegocio("Conta inexistente ou inativa.");

  let linhas: { fitid: string; data: Date; valor: number; descricao: string }[];
  let origem: "OFX" | "CNAB";
  let detalhe = "";
  if (pareceCnab240(texto)) {
    origem = "CNAB";
    const lotes = lerCnab240Extrato(texto);
    if (lotes.length === 0) throw new ErroNegocio("O arquivo CNAB não tem lançamentos de conta.");
    const daConta = lotes.filter((l) => loteDaConta(l, conta) === true);
    let lote = daConta[0];
    if (!lote) {
      const semDados = loteDaConta(lotes[0], conta) === null;
      if (semDados && lotes.length === 1) lote = lotes[0];
      else {
        const contas = lotes.map((l) => `ag. ${l.agencia} c/c ${l.conta}-${l.dac}`).join(", ");
        throw new ErroNegocio(semDados ? `O arquivo tem várias contas (${contas}). Cadastre agência e número nesta conta para escolher a certa.` : `O arquivo é de outra conta (${contas}). Confira a conta selecionada.`);
      }
    }
    linhas = lote.linhas;
    detalhe = lote.saldoFinal ? ` — saldo do banco ${lote.saldoFinal.valor.toFixed(2)}` : "";
    if (lote.futuros) detalhe += ` — ${lote.futuros} lançamento(s) futuro(s) ignorado(s)`;
  } else {
    if (!/<STMTTRN>/i.test(texto)) throw new ErroNegocio("Arquivo não reconhecido. Envie o extrato em OFX ou CNAB 240 (Itaú).");
    origem = "OFX";
    const r = lerOfx(texto);
    linhas = r.linhas;
    if (r.ignoradas) detalhe = ` — ${r.ignoradas} linha(s) inválida(s) ignorada(s)`;
  }
  if (linhas.length === 0) throw new ErroNegocio("Nenhuma transação válida no arquivo.");
  const datas = linhas.map((l) => l.data.getTime());
  const outroFormato = await db.extratoLinha.count({ where: { contaId, origem: origem === "OFX" ? "CNAB" : "OFX", data: { gte: new Date(Math.min(...datas)), lte: new Date(Math.max(...datas)) } } });
  if (outroFormato > 0) {
    throw new ErroNegocio(`Esta conta já tem extrato ${origem === "OFX" ? "CNAB" : "OFX"} importado neste período. Use um único formato por conta para não duplicar os lançamentos.`);
  }
  const r = await db.extratoLinha.createMany({
    data: linhas.map((l) => ({ contaId, data: l.data, valor: l.valor, descricao: l.descricao, fitid: l.fitid, origem })),
    skipDuplicates: true,
  });
  return { origem, novas: r.count, existentes: linhas.length - r.count, detalhe };
}

type Linha = { id: string; contaId: string; data: Date; valor: number; descricao: string };

/**
 * Trava a linha do extrato (FOR UPDATE) e confere que ainda está pendente. A trava vem ANTES de qualquer outra
 * (linha, depois título): duas conciliações da mesma linha esperam uma pela outra e a segunda já a encontra conciliada.
 */
async function linhaPendente(tx: Tx, id: string): Promise<Linha> {
  await tx.$queryRaw`SELECT id FROM "ExtratoLinha" WHERE id = ${id} FOR UPDATE`;
  const l = await tx.extratoLinha.findUnique({ where: { id } });
  if (!l) throw new FinanceiroError("Linha do extrato não encontrada.");
  if (l.lancamentoId) throw new FinanceiroError("Esta linha já está conciliada.");
  return { id: l.id, contaId: l.contaId, data: l.data, valor: toNumber(l.valor), descricao: l.descricao };
}

/** Liga a linha ao lançamento só se ela continuar pendente (defesa extra além da trava). */
async function ligar(tx: Tx, linhaId: string, lancamentoId: string) {
  const r = await tx.extratoLinha.updateMany({ where: { id: linhaId, lancamentoId: null }, data: { lancamentoId, conciliadoEm: new Date() } });
  if (r.count === 0) throw new FinanceiroError("A linha já foi conciliada.");
}

/** Concilia a linha com um lançamento já existente (mesma conta, sentido e valor). */
export async function conciliarComLancamentoTx(tx: Tx, linhaId: string, lancamentoId: string) {
  const l = await linhaPendente(tx, linhaId);
  const lan = await tx.lancamento.findUnique({ where: { id: lancamentoId }, include: { extrato: { select: { id: true } } } });
  if (!lan || lan.extrato) throw new FinanceiroError("Lançamento indisponível para conciliação.");
  if (lan.contaId !== l.contaId) throw new FinanceiroError("O lançamento é de outra conta.");
  if ((lan.sentido === "ENTRADA") !== (l.valor > 0)) throw new FinanceiroError("Entrada/saída não confere com o extrato.");
  if (cent(toNumber(lan.valor)) !== cent(Math.abs(l.valor))) throw new FinanceiroError("O valor do lançamento difere do extrato.");
  await ligar(tx, linhaId, lancamentoId);
}

/** Baixa um título com o valor e a data do extrato e já concilia. Crédito = a receber; débito = a pagar. */
export async function baixarEConciliarTx(tx: Tx, linhaId: string, d: { tituloId: string; juros: number; multa: number; desconto: number }) {
  const l = await linhaPendente(tx, linhaId);
  const lan = await registrarBaixa(tx, {
    tipo: l.valor > 0 ? "receber" : "pagar",
    tituloId: d.tituloId,
    contaId: l.contaId,
    data: l.data,
    valor: Math.abs(l.valor), // o extrato é o dinheiro que moveu a conta
    juros: d.juros,
    multa: d.multa,
    desconto: d.desconto,
  });
  await ligar(tx, linhaId, lan.id);
}

/** Cria um lançamento avulso (tarifa, rendimento...) com os dados do extrato e concilia. */
export async function avulsoEConciliarTx(tx: Tx, linhaId: string, d: { descricao: string; planoContaId: string; centroCustoId: string | null }) {
  await validarClassificacao(tx, d.planoContaId, d.centroCustoId);
  const l = await linhaPendente(tx, linhaId);
  await garantirMesAberto(tx, [l.data], "lançar nessa data");
  const lan = await tx.lancamento.create({
    data: {
      contaId: l.contaId,
      data: l.data,
      sentido: l.valor > 0 ? "ENTRADA" : "SAIDA",
      valor: Math.abs(l.valor),
      descricao: d.descricao,
      planoContaId: d.planoContaId,
      centroCustoId: d.centroCustoId,
    },
  });
  await ligar(tx, linhaId, lan.id);
}

/** Desfaz a conciliação (o lançamento continua existindo). */
export async function desfazerConciliacaoTx(tx: Tx, linhaId: string) {
  const r = await tx.extratoLinha.updateMany({ where: { id: linhaId, lancamentoId: { not: null } }, data: { lancamentoId: null, conciliadoEm: null } });
  if (r.count === 0) throw new FinanceiroError("A linha não está conciliada.");
}

/** Exclui uma linha de extrato ainda não conciliada (ex.: importada na conta errada). */
export async function excluirLinhaExtratoTx(tx: Tx, linhaId: string) {
  const r = await tx.extratoLinha.deleteMany({ where: { id: linhaId, lancamentoId: null } });
  if (r.count === 0) throw new FinanceiroError("Linha inexistente ou já conciliada.");
}
