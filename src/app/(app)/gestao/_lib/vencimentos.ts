/** Lotes a vencer e valor em risco. Puro, testado em tests/gestao/vencimentos.test.ts. */
export const FAIXAS_VENCIMENTO = ["Vencido", "Até 30 dias", "31 a 60 dias", "61 a 90 dias", "91 a 180 dias"] as const;

export type SaldoLote = {
  loteId: string;
  lote: string;
  produtoId: string;
  codigo: string;
  produto: string;
  validade: Date; // meia-noite UTC
  quantidade: number;
  custoMedio: number;
  localTipo: "DEPOSITO" | "HOSPITAL" | "QUARENTENA" | "NAO_CONFORME";
  hospitalId: string | null;
  hospital: string | null;
};

const DIA = 24 * 60 * 60 * 1000;
const cent = (n: number) => Math.round(n * 100);

/** 0 = vencido (validade antes de hoje); 1 = até 30 dias (inclui hoje); 2..4 = 31-60, 61-90, 91-180; -1 = além de 180 dias. */
export function faixaVencimento(validade: Date, hoje: Date): number {
  const dias = Math.round((validade.getTime() - hoje.getTime()) / DIA);
  if (dias < 0) return 0;
  if (dias <= 30) return 1;
  if (dias <= 60) return 2;
  if (dias <= 90) return 3;
  if (dias <= 180) return 4;
  return -1;
}

export type LinhaLote = SaldoLote & { dias: number; faixa: number; valor: number };

/** Uma linha por lote × local com saldo; além de 180 dias e não conforme ficam de fora. Ordena por validade e depois valor. */
export function lotesEmRisco(saldos: SaldoLote[], hoje: Date): LinhaLote[] {
  const out: LinhaLote[] = [];
  for (const s of saldos) {
    if (s.quantidade <= 0 || s.localTipo === "NAO_CONFORME") continue;
    const faixa = faixaVencimento(s.validade, hoje);
    if (faixa < 0) continue;
    out.push({ ...s, dias: Math.round((s.validade.getTime() - hoje.getTime()) / DIA), faixa, valor: cent(s.quantidade * s.custoMedio) / 100 });
  }
  return out.sort((a, b) => a.validade.getTime() - b.validade.getTime() || cent(b.valor) - cent(a.valor));
}

export function totaisPorFaixa(linhas: LinhaLote[]): { valor: number[]; quantidade: number[]; total: number } {
  const v = [0, 0, 0, 0, 0];
  const q = [0, 0, 0, 0, 0];
  for (const l of linhas) {
    v[l.faixa] += cent(l.valor);
    q[l.faixa] += l.quantidade;
  }
  return { valor: v.map((x) => x / 100), quantidade: q, total: v.reduce((s, x) => s + x, 0) / 100 };
}

export type LinhaHospitalRisco = { hospitalId: string; hospital: string; faixas: number[]; total: number; lotes: number };

/** Só consignado (local do tipo HOSPITAL): valor em risco por faixa em cada hospital; maior valor total primeiro. */
export function riscoPorHospital(linhas: LinhaLote[]): LinhaHospitalRisco[] {
  const m = new Map<string, { hospitalId: string; hospital: string; f: number[]; lotes: Set<string> }>();
  for (const l of linhas) {
    if (l.localTipo !== "HOSPITAL" || !l.hospitalId) continue;
    const h = m.get(l.hospitalId) ?? { hospitalId: l.hospitalId, hospital: l.hospital ?? "—", f: [0, 0, 0, 0, 0], lotes: new Set<string>() };
    h.f[l.faixa] += cent(l.valor);
    h.lotes.add(l.loteId);
    m.set(l.hospitalId, h);
  }
  return [...m.values()]
    .map((h) => ({ hospitalId: h.hospitalId, hospital: h.hospital, faixas: h.f.map((x) => x / 100), total: h.f.reduce((s, x) => s + x, 0) / 100, lotes: h.lotes.size }))
    .sort((a, b) => cent(b.total) - cent(a.total) || a.hospital.localeCompare(b.hospital, "pt-BR"));
}
