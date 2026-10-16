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

/** Muda o status do orçamento respeitando as transições; enviar exige ao menos um item. */
export async function mudarStatusOrcamentoTx(tx: Tx, id: number, status: StatusOrcamento) {
  const o = await tx.orcamento.findUniqueOrThrow({ where: { id }, include: { _count: { select: { itens: true } } } });
  if (!TRANSICOES[o.status]?.includes(status)) throw new ErroNegocio(`Não é possível passar de ${o.status} para ${status}.`);
  if (status === "ENVIADO" && o._count.itens === 0) throw new ErroNegocio("Inclua ao menos um item antes de enviar.");
  await tx.orcamento.update({ where: { id }, data: { status } });
}
