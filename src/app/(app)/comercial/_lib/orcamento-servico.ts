import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

export type StatusOrcamento = "RASCUNHO" | "ENVIADO" | "APROVADO" | "RECUSADO";

const TRANSICOES: Record<string, string[]> = {
  RASCUNHO: ["ENVIADO"],
  ENVIADO: ["APROVADO", "RECUSADO", "RASCUNHO"],
  APROVADO: [],
  RECUSADO: ["RASCUNHO"],
};

/** Trava a linha do orçamento até o fim da transação (edição de itens e troca de status passam uma de cada vez). */
async function travarOrcamento(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "Orcamento" WHERE id = ${id} FOR UPDATE`;
}

/**
 * Exige orçamento em RASCUNHO, com a linha travada: chamar dentro da MESMA transação que grava a alteração. Fora dela,
 * enviar (ENVIADO) no meio de uma edição deixava a edição entrar num orçamento já enviado ao cliente.
 */
export async function exigirOrcamentoEditavelTx(tx: Tx, id: number) {
  await travarOrcamento(tx, id);
  const o = await tx.orcamento.findUniqueOrThrow({ where: { id } });
  if (o.status !== "RASCUNHO") throw new ErroNegocio("Só é possível alterar orçamentos em rascunho.");
  return o;
}

/** Muda o status do orçamento respeitando as transições; enviar exige ao menos um item. */
export async function mudarStatusOrcamentoTx(tx: Tx, id: number, status: StatusOrcamento) {
  await travarOrcamento(tx, id);
  const o = await tx.orcamento.findUniqueOrThrow({ where: { id }, include: { _count: { select: { itens: true } } } });
  if (!TRANSICOES[o.status]?.includes(status)) throw new ErroNegocio(`Não é possível passar de ${o.status} para ${status}.`);
  if (status === "ENVIADO" && o._count.itens === 0) throw new ErroNegocio("Inclua ao menos um item antes de enviar.");
  await tx.orcamento.update({ where: { id }, data: { status } });
}
