import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { cancelarContaPagarGeradaTx } from "../../financeiro/_lib/publico";
import { travarPedido } from "./importacao-servico";

/**
 * Cancela um pedido ABERTO (sem recebimento) e, na mesma transação, as contas a pagar das despesas de importação
 * já lançadas (frete, despachante etc.). Antes elas ficavam abertas e podiam ir para aprovação e SISPAG.
 * Conta já paga, em remessa SISPAG ativa ou em mês fechado recusa o cancelamento inteiro (mensagem do financeiro).
 */
export async function cancelarPedidoCompraTx(tx: Tx, pedidoId: number): Promise<{ contasCanceladas: number }> {
  const p = await travarPedido(tx, pedidoId);
  if (p.status !== "ABERTO") throw new ErroNegocio("Só é possível cancelar pedidos em aberto, sem recebimentos.");
  let contasCanceladas = 0;
  for (const d of p.despesas) {
    if (!d.contaPagarId) continue;
    await cancelarContaPagarGeradaTx(tx, d.contaPagarId);
    contasCanceladas++;
  }
  await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { status: "CANCELADO" } });
  return { contasCanceladas };
}
