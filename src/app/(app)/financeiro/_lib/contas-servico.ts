import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { money, toNumber } from "@/lib/format";
import { listarContas } from "./contas";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";

/** Regras de conta bancária e lançamento avulso que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */

/** Lançamento sem título (tarifa, rendimento...) numa conta ativa, em mês aberto. */
export async function lancarAvulsoTx(tx: Tx, contaId: string, d: { sentido: "ENTRADA" | "SAIDA"; descricao: string; planoContaId: string; centroCustoId: string | null; valor: number; data: Date }) {
  const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
  if (!conta?.ativo) throw new ErroNegocio("Conta inexistente ou inativa.");
  await validarClassificacao(tx, d.planoContaId, d.centroCustoId);
  await garantirMesAberto(tx, [d.data], "lançar nessa data");
  return tx.lancamento.create({ data: { contaId, ...d } });
}

/** Exclui um lançamento avulso não conciliado. Baixas de título e transferências são estornadas pelo próprio dono. Devolve a conta. */
export async function excluirLancamentoAvulsoTx(tx: Tx, id: string): Promise<string> {
  const l = await tx.lancamento.findUnique({ where: { id }, select: { contaId: true, data: true, contaReceberId: true, contaPagarId: true, transferenciaId: true, extrato: { select: { id: true } } } });
  if (!l) throw new ErroNegocio("Lançamento não encontrado.");
  if (l.transferenciaId) throw new ErroNegocio("Este lançamento é parte de uma transferência. Estorne a transferência inteira.");
  if (l.contaReceberId || l.contaPagarId) throw new ErroNegocio("Este lançamento é baixa de título. Estorne pela tela do título.");
  if (l.extrato) throw new ErroNegocio("Lançamento conciliado com o extrato. Desfaça a conciliação antes.");
  await garantirMesAberto(tx, [l.data], "excluir lançamento dessa data");
  await tx.lancamento.delete({ where: { id } });
  return l.contaId;
}

export type DadosConta = {
  nome: string;
  tipo: "BANCO" | "CAIXA";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldoInicial: number;
  titularCnpj: string | null;
  titularNome: string | null;
  carteiraCobranca: "109" | null;
  cobrancaMultaPercent: number;
  cobrancaJurosMensalPercent: number;
};

/** Só dígitos, sem zeros à esquerda: mesma normalização do índice único de agência/conta e da leitura dos retornos. */
const soDigitos = (s: string | null) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const CAMPOS_AUDITADOS = ["nome", "tipo", "banco", "agencia", "numero", "saldoInicial", "titularCnpj", "titularNome", "carteiraCobranca", "cobrancaMultaPercent", "cobrancaJurosMensalPercent"] as const;

/**
 * Cria (id = null) ou edita a conta. Recusa outra conta bancária ativa com a mesma agência/conta (o retorno do banco
 * precisa achar uma só) e, em conta que já tem lançamentos, a troca do saldo inicial (mudaria todos os saldos passados,
 * inclusive de meses fechados e conciliados). Devolve o id e o resumo "campo: antes → depois" para a auditoria.
 */
export async function salvarContaTx(tx: Tx, id: string | null, d: DadosConta): Promise<{ id: string; nome: string; mudancas: string }> {
  if (d.tipo === "BANCO" && soDigitos(d.agencia) && soDigitos(d.numero)) {
    const outras = await tx.contaBancaria.findMany({ where: { tipo: "BANCO", ativo: true, ...(id ? { id: { not: id } } : {}) }, select: { nome: true, agencia: true, numero: true } });
    const dup = outras.find((o) => soDigitos(o.agencia) === soDigitos(d.agencia) && soDigitos(o.numero) === soDigitos(d.numero));
    if (dup) throw new ErroNegocio(`A conta "${dup.nome}" já usa a agência ${d.agencia} e a conta ${d.numero}. Inative-a ou corrija os dados.`);
  }
  if (!id) {
    const c = await tx.contaBancaria.create({ data: d });
    return { id: c.id, nome: c.nome, mudancas: "" };
  }
  await tx.$queryRaw`SELECT id FROM "ContaBancaria" WHERE id = ${id} FOR UPDATE`;
  const antes = await tx.contaBancaria.findUnique({ where: { id } });
  if (!antes) throw new ErroNegocio("Conta não encontrada.");
  if (Math.round(toNumber(antes.saldoInicial) * 100) !== Math.round(d.saldoInicial * 100) && (await tx.lancamento.count({ where: { contaId: id } })) > 0) {
    throw new ErroNegocio(`A conta já tem lançamentos: o saldo inicial (${money(toNumber(antes.saldoInicial))}) não pode mais mudar, porque alteraria todos os saldos já conferidos. Para corrigir, faça um lançamento avulso de ajuste.`);
  }
  const c = await tx.contaBancaria.update({ where: { id }, data: d });
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const mudancas = CAMPOS_AUDITADOS.filter((k) => fmt(antes[k]) !== fmt(c[k])).map((k) => `${k}: ${fmt(antes[k])} → ${fmt(c[k])}`).join("; ");
  return { id: c.id, nome: c.nome, mudancas };
}

/** Ativa ou inativa a conta. Devolve o estado anterior e o nome (para a auditoria). */
export async function alternarAtivoContaTx(tx: Tx, id: string) {
  const c = await tx.contaBancaria.findUniqueOrThrow({ where: { id } });
  if (c.ativo) {
    // conta inativa sai do saldo, do painel e do fluxo: com saldo diferente de zero, os números deixariam de fechar
    const conta = (await listarContas()).find((x) => x.id === id);
    if (conta && Math.abs(conta.saldo) >= 0.005) throw new ErroNegocio(`A conta tem saldo de ${money(conta.saldo)}. Zere o saldo (transferência ou lançamento) antes de inativá-la.`);
  } else if (c.tipo === "BANCO" && soDigitos(c.agencia) && soDigitos(c.numero)) {
    const ativas = await tx.contaBancaria.findMany({ where: { tipo: "BANCO", ativo: true }, select: { nome: true, agencia: true, numero: true } });
    const dup = ativas.find((o) => soDigitos(o.agencia) === soDigitos(c.agencia) && soDigitos(o.numero) === soDigitos(c.numero));
    if (dup) throw new ErroNegocio(`A conta "${dup.nome}" está ativa com a mesma agência e conta. Inative-a antes de reativar esta.`);
  }
  await tx.contaBancaria.update({ where: { id }, data: { ativo: !c.ativo } });
  return { eraAtiva: c.ativo, nome: c.nome };
}
