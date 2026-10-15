"use server";

import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toNumber } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import type { Tx } from "@/lib/db";
import { lerCnab240Extrato, loteDaConta, pareceCnab240 } from "./cnab240-extrato";
import { decodificarOfx, lerOfx, OFX_MAX_BYTES } from "./ofx";
import { FinanceiroError, registrarBaixa } from "./titulos";

const cent = (n: number) => Math.round(n * 100);

function revalidar() {
  for (const p of ["/financeiro/conciliacao", "/financeiro/contas", "/financeiro/receber", "/financeiro/pagar", "/financeiro/fluxo"]) revalidatePath(p);
}

/** Importa o extrato (OFX ou CNAB 240 do Itaú) numa conta. Linhas já importadas são ignoradas. */
export async function importarExtrato(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const contaId = fd.get("contaId");
  const file = fd.get("arquivo");
  if (typeof contaId !== "string" || !contaId) return { error: "Escolha a conta." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo do extrato." };
  if (file.size > OFX_MAX_BYTES) return { error: "Arquivo maior que 5 MB. Exporte um período menor." };
  try {
    const conta = await db.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true, agencia: true, numero: true } });
    if (!conta?.ativo) return { error: "Conta inexistente ou inativa." };
    const texto = decodificarOfx(new Uint8Array(await file.arrayBuffer()));

    let linhas: { fitid: string; data: Date; valor: number; descricao: string }[];
    let origem: "OFX" | "CNAB";
    let detalhe = "";
    if (pareceCnab240(texto)) {
      origem = "CNAB";
      const lotes = lerCnab240Extrato(texto);
      if (lotes.length === 0) return { error: "O arquivo CNAB não tem lançamentos de conta." };
      const daConta = lotes.filter((l) => loteDaConta(l, conta) === true);
      let lote = daConta[0];
      if (!lote) {
        const semDados = loteDaConta(lotes[0], conta) === null;
        if (semDados && lotes.length === 1) lote = lotes[0];
        else {
          const contas = lotes.map((l) => `ag. ${l.agencia} c/c ${l.conta}-${l.dac}`).join(", ");
          return { error: semDados ? `O arquivo tem várias contas (${contas}). Cadastre agência e número nesta conta para escolher a certa.` : `O arquivo é de outra conta (${contas}). Confira a conta selecionada.` };
        }
      }
      linhas = lote.linhas;
      detalhe = lote.saldoFinal ? ` — saldo do banco ${lote.saldoFinal.valor.toFixed(2)}` : "";
      if (lote.futuros) detalhe += ` — ${lote.futuros} lançamento(s) futuro(s) ignorado(s)`;
    } else {
      if (!/<STMTTRN>/i.test(texto)) return { error: "Arquivo não reconhecido. Envie o extrato em OFX ou CNAB 240 (Itaú)." };
      origem = "OFX";
      const r = lerOfx(texto);
      linhas = r.linhas;
      if (r.ignoradas) detalhe = ` — ${r.ignoradas} linha(s) inválida(s) ignorada(s)`;
    }
    if (linhas.length === 0) return { error: "Nenhuma transação válida no arquivo." };
    // OFX e CNAB identificam o mesmo lançamento de jeitos diferentes: misturar os dois no mesmo período duplicaria o extrato
    const datas = linhas.map((l) => l.data.getTime());
    const outroFormato = await db.extratoLinha.count({ where: { contaId, origem: origem === "OFX" ? "CNAB" : "OFX", data: { gte: new Date(Math.min(...datas)), lte: new Date(Math.max(...datas)) } } });
    if (outroFormato > 0) {
      return { error: `Esta conta já tem extrato ${origem === "OFX" ? "CNAB" : "OFX"} importado neste período. Use um único formato por conta para não duplicar os lançamentos.` };
    }
    const r = await db.extratoLinha.createMany({
      data: linhas.map((l) => ({ contaId, data: l.data, valor: l.valor, descricao: l.descricao, fitid: l.fitid, origem })),
      skipDuplicates: true,
    });
    await audit(user.id, "importar extrato", "ContaBancaria", contaId, `${origem}: ${r.count} nova(s), ${linhas.length - r.count} já existente(s)${detalhe}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

type Linha = { id: string; contaId: string; data: Date; valor: number; descricao: string };

async function linhaPendente(tx: Tx, id: string): Promise<Linha> {
  const l = await tx.extratoLinha.findUnique({ where: { id } });
  if (!l) throw new FinanceiroError("Linha do extrato não encontrada.");
  if (l.lancamentoId) throw new FinanceiroError("Esta linha já está conciliada.");
  return { id: l.id, contaId: l.contaId, data: l.data, valor: toNumber(l.valor), descricao: l.descricao };
}

const ligar = (tx: Tx, linhaId: string, lancamentoId: string) =>
  tx.extratoLinha.update({ where: { id: linhaId }, data: { lancamentoId, conciliadoEm: new Date() } });

/** Concilia a linha com um lançamento já existente (mesma conta, sentido e valor). */
export async function conciliarComLancamento(linhaId: string, lancamentoId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    await db.$transaction(async (tx) => {
      const l = await linhaPendente(tx, linhaId);
      const lan = await tx.lancamento.findUnique({ where: { id: lancamentoId }, include: { extrato: { select: { id: true } } } });
      if (!lan || lan.extrato) throw new FinanceiroError("Lançamento indisponível para conciliação.");
      if (lan.contaId !== l.contaId) throw new FinanceiroError("O lançamento é de outra conta.");
      if ((lan.sentido === "ENTRADA") !== (l.valor > 0)) throw new FinanceiroError("Entrada/saída não confere com o extrato.");
      if (cent(toNumber(lan.valor)) !== cent(Math.abs(l.valor))) throw new FinanceiroError("O valor do lançamento difere do extrato.");
      await ligar(tx, linhaId, lancamentoId);
    });
    await audit(user.id, "conciliar", "ExtratoLinha", linhaId, `lançamento ${lancamentoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

const schemaTitulo = z.object({
  tituloId: zf.text("Escolha o título"),
  juros: zf.money().default(0),
  multa: zf.money().default(0),
  desconto: zf.money().default(0),
});

/** Baixa um título com o valor e a data do extrato e já concilia. Crédito = a receber; débito = a pagar. */
export async function baixarEConciliar(linhaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaTitulo, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction(async (tx) => {
      const l = await linhaPendente(tx, linhaId);
      const lan = await registrarBaixa(tx, {
        tipo: l.valor > 0 ? "receber" : "pagar",
        tituloId: parsed.data.tituloId,
        contaId: l.contaId,
        data: l.data,
        valor: Math.abs(l.valor), // o extrato é o dinheiro que moveu a conta
        juros: parsed.data.juros,
        multa: parsed.data.multa,
        desconto: parsed.data.desconto,
      });
      await ligar(tx, linhaId, lan.id);
    });
    await audit(user.id, "baixar e conciliar", "ExtratoLinha", linhaId, `título ${parsed.data.tituloId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

const schemaAvulso = z.object({ descricao: zf.text(), planoContaId: zf.text("Escolha a conta do plano"), centroCustoId: zf.optText() });

/** Cria um lançamento avulso (tarifa, rendimento...) com os dados do extrato e concilia. */
export async function avulsoEConciliar(linhaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaAvulso, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction(async (tx) => {
      await validarClassificacao(tx, parsed.data.planoContaId, parsed.data.centroCustoId);
      const l = await linhaPendente(tx, linhaId);
      await garantirMesAberto(tx, [l.data], "lançar nessa data");
      const lan = await tx.lancamento.create({
        data: {
          contaId: l.contaId,
          data: l.data,
          sentido: l.valor > 0 ? "ENTRADA" : "SAIDA",
          valor: Math.abs(l.valor),
          descricao: parsed.data.descricao,
          planoContaId: parsed.data.planoContaId,
          centroCustoId: parsed.data.centroCustoId,
        },
      });
      await ligar(tx, linhaId, lan.id);
    });
    await audit(user.id, "lançar e conciliar", "ExtratoLinha", linhaId, `${parsed.data.descricao}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Desfaz a conciliação (o lançamento continua existindo). */
export async function desfazerConciliacao(linhaId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    const r = await db.extratoLinha.updateMany({ where: { id: linhaId, lancamentoId: { not: null } }, data: { lancamentoId: null, conciliadoEm: null } });
    if (r.count === 0) return { error: "A linha não está conciliada." };
    await audit(user.id, "desfazer conciliação", "ExtratoLinha", linhaId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Exclui uma linha de extrato ainda não conciliada (ex.: importada na conta errada). */
export async function excluirLinhaExtrato(linhaId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    const r = await db.extratoLinha.deleteMany({ where: { id: linhaId, lancamentoId: null } });
    if (r.count === 0) return { error: "Linha inexistente ou já conciliada." };
    await audit(user.id, "excluir linha de extrato", "ExtratoLinha", linhaId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
