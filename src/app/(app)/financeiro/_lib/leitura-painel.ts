import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";

/** Leitura para o painel/sino (só leitura): contas a pagar geradas por outros módulos aguardando aprovação. */
export async function contarAprovacoesPendentes(): Promise<number> {
  return db.contaPagar.count({ where: { aprovadoEm: null, status: "ABERTO" } });
}

export type InventarioACobrar = { id: number; hospital: string; fechadoEm: Date | null; valor: number };

/**
 * Faltas de inventário de consignado que o estoque resolveu como "cobrar do hospital" (decisão M6: não geram título
 * sozinhas; o financeiro lança a conta a receber com a NF). Só leitura da tabela do estoque (ADR-2): importar de
 * `estoque/_lib/publico.ts` fecharia o ciclo estoque → comercial → financeiro → estoque (regra R5).
 * Não há vínculo com o título lançado (docs/INTEGRACAO-SETORES.md, G6): a lista mostra todos os fechados com valor.
 */
export async function inventariosACobrar(limite = 8): Promise<{ qtd: number; total: number; itens: InventarioACobrar[] }> {
  const comValor = { status: "FECHADO" as const, itens: { some: { valorCobrar: { gt: 0 } } } };
  const [qtd, soma, lista] = await Promise.all([
    db.inventarioConsignacao.count({ where: comValor }),
    db.inventarioConsignacaoItem.aggregate({ where: { valorCobrar: { gt: 0 }, inventario: { status: "FECHADO" } }, _sum: { valorCobrar: true } }),
    db.inventarioConsignacao.findMany({
      where: comValor,
      orderBy: { fechadoEm: "desc" },
      take: limite,
      select: { id: true, fechadoEm: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } }, itens: { where: { valorCobrar: { gt: 0 } }, select: { valorCobrar: true } } },
    }),
  ]);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    qtd,
    total: r2(toNumber(soma._sum.valorCobrar)),
    itens: lista.map((i) => ({ id: i.id, fechadoEm: i.fechadoEm, hospital: i.hospital.nomeFantasia || i.hospital.razaoSocial, valor: r2(i.itens.reduce((s, x) => s + toNumber(x.valorCobrar), 0)) })),
  };
}
