import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Trava a linha da cirurgia até o fim da transação. Toda transição que lê o status ou o consumo para decidir
 * (faturar, consumo direto, conferência de vale, estorno de consumo, confirmar, cancelar, editar) chama isto
 * ANTES de ler: assim faturar e registrar consumo ao mesmo tempo não deixam consumo fora do pedido,
 * e cancelar não passa com um consumo entrando em paralelo.
 */
export async function travarCirurgia(tx: Tx, cirurgiaId: string) {
  await tx.$queryRaw`SELECT id FROM "Cirurgia" WHERE id = ${cirurgiaId} FOR UPDATE`;
}
