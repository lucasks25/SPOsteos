import "server-only";
import type { Tx } from "@/lib/db";
import { movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";

/**
 * Ajuste manual de estoque (entrada, saída, perda). Fora de "use server" para ser testado sem login.
 * O saldo só muda por movimentar(): saída acima do saldo é recusada lá.
 */

export type AjusteInput = {
  operacao: "ENTRADA" | "SAIDA" | "PERDA";
  localId: string;
  loteId: string;
  quantidade: number;
  observacao?: string | null;
  usuario: string;
};

export async function registrarAjusteEstoque(tx: Tx, d: AjusteInput) {
  const lote = await tx.lote.findUniqueOrThrow({ where: { id: d.loteId }, include: { produto: true } });
  const entrada = d.operacao === "ENTRADA";
  const mov = await movimentar(tx, {
    tipo: d.operacao === "PERDA" ? "PERDA" : "AJUSTE",
    produtoId: lote.produtoId,
    loteId: lote.id,
    quantidade: d.quantidade,
    origemId: entrada ? null : d.localId,
    destinoId: entrada ? d.localId : null,
    custoUnit: toNumber(lote.produto.custoMedio),
    documento: d.operacao === "PERDA" ? "PERDA" : entrada ? "AJUSTE+" : "AJUSTE-",
    observacao: d.observacao ?? undefined,
    usuario: d.usuario,
  });
  return { movimentoId: mov.id, produtoCodigo: lote.produto.codigo, loteNumero: lote.numero };
}
