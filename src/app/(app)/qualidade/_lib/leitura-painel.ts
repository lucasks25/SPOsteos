import "server-only";
import { db } from "@/lib/db";
import { addDias } from "@/lib/datas";

/** Leituras da qualidade para o painel e o sino (só leitura; ARQ-05). */

export async function contarRecolhimentos(hoje: Date) {
  const ativo = { status: { in: ["ABERTO", "EM_ANDAMENTO"] as ("ABERTO" | "EM_ANDAMENTO")[] } };
  const [abertos, vencidos] = await Promise.all([db.recolhimento.count({ where: ativo }), db.recolhimento.count({ where: { ...ativo, prazo: { lt: hoje } } })]);
  return { abertos, vencidos };
}

/** Lotes em quarentena com saldo. */
export async function contarLotesQuarentena(): Promise<number> {
  return db.lote.count({ where: { status: "QUARENTENA", saldos: { some: { quantidade: { gt: 0 } } } } });
}

/** Lotes com saldo vencidos ou que vencem em até 30 dias a partir de `hoje`. */
export async function contarLotesVencendo(hoje: Date): Promise<number> {
  return db.lote.count({ where: { validade: { lt: addDias(hoje, 30) }, saldos: { some: { quantidade: { gt: 0 } } } } });
}

/** Produtos ativos com registro ANVISA vencido ou vencendo em 90 dias. */
export async function contarRegistrosVencendo(hoje: Date): Promise<number> {
  return db.produto.count({ where: { ativo: true, validadeRegistro: { lt: addDias(hoje, 90) } } });
}
