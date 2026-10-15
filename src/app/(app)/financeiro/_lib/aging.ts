/** Aging (idade da dívida em aberto) por hospital ou fornecedor. Parte pura, testada em tests/financeiro/aging.test.ts. */
export type TituloAberto = { parceiroId: string | null; parceiro: string; saldo: number; vencimento: Date };

export const FAIXAS_AGING = ["A vencer", "1 a 30 dias", "31 a 60 dias", "61 a 90 dias", "Mais de 90 dias"] as const;

const DIA = 24 * 60 * 60 * 1000;
const cent = (n: number) => Math.round(n * 100);

/** 0 = a vencer (vence hoje ou depois); 1..4 = dias de atraso. `hoje` e `vencimento` em meia-noite UTC. */
export function faixaAtraso(vencimento: Date, hoje: Date): number {
  const dias = Math.round((hoje.getTime() - vencimento.getTime()) / DIA);
  if (dias <= 0) return 0;
  if (dias <= 30) return 1;
  if (dias <= 60) return 2;
  if (dias <= 90) return 3;
  return 4;
}

export type LinhaAging = { parceiroId: string | null; parceiro: string; faixas: number[]; total: number; vencido: number; maiorAtrasoDias: number; qtd: number };

export function agingPorParceiro(titulos: TituloAberto[], hoje: Date): { linhas: LinhaAging[]; totais: number[]; total: number } {
  const mapa = new Map<string, LinhaAging>();
  for (const t of titulos) {
    if (cent(t.saldo) <= 0) continue;
    const chave = t.parceiroId ?? "sem";
    const l = mapa.get(chave) ?? { parceiroId: t.parceiroId, parceiro: t.parceiro, faixas: [0, 0, 0, 0, 0], total: 0, vencido: 0, maiorAtrasoDias: 0, qtd: 0 };
    const f = faixaAtraso(t.vencimento, hoje);
    l.faixas[f] = (cent(l.faixas[f]) + cent(t.saldo)) / 100;
    l.total = (cent(l.total) + cent(t.saldo)) / 100;
    if (f > 0) l.vencido = (cent(l.vencido) + cent(t.saldo)) / 100;
    l.maiorAtrasoDias = Math.max(l.maiorAtrasoDias, Math.round((hoje.getTime() - t.vencimento.getTime()) / DIA));
    l.qtd++;
    mapa.set(chave, l);
  }
  const linhas = [...mapa.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total);
  const totais = [0, 1, 2, 3, 4].map((i) => linhas.reduce((s, l) => s + cent(l.faixas[i]), 0) / 100);
  return { linhas, totais, total: totais.reduce((s, v) => s + cent(v), 0) / 100 };
}

/** CSV para Excel brasileiro: separador ";", decimal com vírgula, BOM UTF-8, e neutraliza fórmulas (=, +, -, @). */
export function csv(linhas: (string | number)[][]): string {
  const cel = (v: string | number) => {
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `﻿${linhas.map((l) => l.map(cel).join(";")).join("\r\n")}\r\n`;
}
