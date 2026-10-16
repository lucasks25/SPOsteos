import "server-only";
import { db } from "@/lib/db";

/** Leituras do estoque para o painel e o sino (só leitura; ARQ-05). */

/** Remessas (vales) enviadas aos hospitais, aguardando conferência. */
export async function contarRemessasAConferir(): Promise<number> {
  return db.remessa.count({ where: { status: "ENVIADA" } });
}

/** Produtos ativos com estoque mínimo cujo disponível liberado (depósito + hospital, lote liberado e dentro da validade) é menor que o mínimo. */
export async function contarAbaixoDoMinimo(hoje: Date): Promise<number> {
  const [produtos, saldos] = await Promise.all([
    db.produto.findMany({ where: { ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, estoqueMinimo: true } }),
    db.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: hoje } } }, _sum: { quantidade: true } }),
  ]);
  const mapa = new Map(saldos.map((s) => [s.produtoId, s._sum.quantidade ?? 0]));
  return produtos.filter((x) => (mapa.get(x.id) ?? 0) < x.estoqueMinimo).length;
}
