import "server-only";
import { db } from "@/lib/db";
import { addDias } from "@/lib/datas";

/** Leituras do estoque para o painel e o sino (só leitura; ARQ-05). */

/** Remessas (vales) enviadas aos hospitais, aguardando conferência. */
export async function contarRemessasAConferir(): Promise<number> {
  return db.remessa.count({ where: { status: "ENVIADA" } });
}

/** `hoje` = meia-noite UTC do dia (hojeUTC), pois a validade é gravada 00:00Z. Produtos ativos com estoque mínimo cujo disponível liberado (depósito + hospital, lote liberado e dentro da validade) é menor que o mínimo. */
export async function contarAbaixoDoMinimo(hoje: Date): Promise<number> {
  const [produtos, saldos] = await Promise.all([
    db.produto.findMany({ where: { ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, estoqueMinimo: true } }),
    db.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: hoje } } }, _sum: { quantidade: true } }),
  ]);
  const mapa = new Map(saldos.map((s) => [s.produtoId, s._sum.quantidade ?? 0]));
  return produtos.filter((x) => (mapa.get(x.id) ?? 0) < x.estoqueMinimo).length;
}

/**
 * Fila do estoque para o painel/sino: cirurgias AGENDADA/CONFIRMADA sem vale ativo (remessa não cancelada) até `dias`
 * à frente de `hoje` (meia-noite de Brasília), incluindo as atrasadas. Mesma regra de `cirurgiasAguardandoVale`.
 */
export async function contarCirurgiasAguardandoVale(hoje: Date, dias = 7): Promise<number> {
  return db.cirurgia.count({
    where: { status: { in: ["AGENDADA", "CONFIRMADA"] }, remessas: { none: { status: { not: "CANCELADA" } } }, dataHora: { lt: addDias(hoje, dias + 1) } },
  });
}
