import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/** Cancela um pedido ABERTO (sem NF); a cirurgia FATURADA volta a REALIZADA e pode ser faturada de novo. */
export async function cancelarPedidoVendaTx(tx: Tx, pedidoId: number) {
  const r = await tx.pedidoVenda.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "CANCELADO" } });
  if (r.count === 0) throw new ErroNegocio("Só é possível cancelar pedidos em aberto (sem NF).");
  const p = await tx.pedidoVenda.findUniqueOrThrow({ where: { id: pedidoId }, select: { cirurgiaId: true, total: true } });
  if (p.cirurgiaId) await tx.cirurgia.updateMany({ where: { id: p.cirurgiaId, status: "FATURADA" }, data: { status: "REALIZADA" } });
  return p;
}
