import "server-only";
import { diaBrasilia } from "@/lib/datas";
import { db, type Tx } from "@/lib/db";
import { toNumber } from "@/lib/format";

type Client = Tx | typeof db;

/** A tabela está vigente na data de referência? */
export function tabelaVigente(t: { vigenciaInicio: Date | null; vigenciaFim: Date | null }, ref = new Date()) {
  // início e fim são datas (meia-noite UTC do dia em Brasília): compara por DIA de Brasília, não pelo instante UTC
  // (entre 21h e 24h de Brasília o dia UTC já é o seguinte). A tabela vale até o fim do último dia.
  const dia = diaBrasilia(ref);
  if (t.vigenciaInicio && t.vigenciaInicio.getTime() > dia.getTime()) return false;
  if (t.vigenciaFim && t.vigenciaFim.getTime() < dia.getTime()) return false;
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

/**
 * O hospital tem tabela de preço, mas ela não está vigente em `ref`? Nesse caso `precosDoHospital` usa o preço base
 * em silêncio: quem fatura/orça precisa ser avisado. Devolve o nome da tabela, ou null quando não há o que avisar.
 */
export async function tabelaForaDeVigencia(client: Client, hospitalId: string | null, ref = new Date()): Promise<string | null> {
  if (!hospitalId) return null;
  const h = await client.hospital.findUnique({ where: { id: hospitalId }, select: { tabelaPreco: { select: { nome: true, vigenciaInicio: true, vigenciaFim: true } } } });
  const t = h?.tabelaPreco;
  return t && !tabelaVigente(t, ref) ? t.nome : null;
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
