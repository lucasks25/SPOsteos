import "server-only";
import { db, type Tx } from "@/lib/db";
import { toNumber } from "@/lib/format";

type Client = Tx | typeof db;

/** A tabela está vigente na data de referência? */
export function tabelaVigente(t: { vigenciaInicio: Date | null; vigenciaFim: Date | null }, ref = new Date()) {
  if (t.vigenciaInicio && t.vigenciaInicio.getTime() > ref.getTime()) return false;
  // vigenciaFim é uma data (00:00 UTC): vale até o fim desse dia
  if (t.vigenciaFim && t.vigenciaFim.getTime() + 24 * 60 * 60 * 1000 <= ref.getTime()) return false;
  return true;
}

/**
 * Preços por produto para um hospital: tabela de preço do hospital (se vigente)
 * e, na falta, o preço base do produto.
 */
export async function precosDoHospital(client: Client, hospitalId: string | null, produtoIds: string[], ref = new Date()) {
  const ids = [...new Set(produtoIds)];
  const produtos = await client.produto.findMany({ where: { id: { in: ids } }, select: { id: true, precoBase: true, custoMedio: true } });
  const result = new Map<string, { preco: number; custo: number }>();
  for (const p of produtos) result.set(p.id, { preco: toNumber(p.precoBase), custo: toNumber(p.custoMedio) });
  if (!hospitalId) return result;
  const hospital = await client.hospital.findUnique({
    where: { id: hospitalId },
    select: { tabelaPreco: { include: { itens: { where: { produtoId: { in: ids } } } } } },
  });
  const tabela = hospital?.tabelaPreco;
  if (tabela && tabelaVigente(tabela, ref)) {
    for (const item of tabela.itens) {
      const atual = result.get(item.produtoId);
      if (atual) atual.preco = toNumber(item.preco);
    }
  }
  return result;
}

/** Mapa hospitalId → { produtoId → preço } das tabelas vigentes (para preencher formulários no cliente). */
export async function tabelasPorHospital(ref = new Date()) {
  const hospitais = await db.hospital.findMany({
    where: { tabelaPrecoId: { not: null } },
    select: { id: true, tabelaPreco: { include: { itens: { select: { produtoId: true, preco: true } } } } },
  });
  const out: Record<string, Record<string, number>> = {};
  for (const h of hospitais) {
    if (!h.tabelaPreco || !tabelaVigente(h.tabelaPreco, ref)) continue;
    out[h.id] = Object.fromEntries(h.tabelaPreco.itens.map((i) => [i.produtoId, toNumber(i.preco)]));
  }
  return out;
}
