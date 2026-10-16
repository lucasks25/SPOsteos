/** Planejamento (puro) da demonstração: cirurgias/procedimentos mai–out/2026, agenda futura e vendas diretas a subdistribuidores. */
import { HOSPITAIS, MEDICOS, NOMES, PROCEDIMENTOS, SOBRENOMES, type ProcDef } from "./catalogo";
import { addD, dia, diaSemana, entre, mulberry32, pick, pickPeso, type Rnd } from "./util";

export type ItemPlano = { cod: string; qtd: number; enviar: number; deixar: number };
export type Destino = "FATURADA" | "REALIZADA" | "PEDIDO_ABERTO" | "CANCELADA" | "FUTURA_ENVIADA" | "FUTURA_ABERTA" | "FUTURA_SEM_VALE";
export type AuthFutura = "AUTORIZADA" | "SOLICITADA" | "NEGADA" | "NENHUMA";
export type PlanoCirurgia = {
  dia: Date; h: number; min: number; hosp: string; med: string; conv: string | null; sus: boolean; proc: string; rep: string;
  paciente: string; carteirinha: string | null; itens: ItemPlano[]; destino: Destino; confirmada: boolean; auth: AuthFutura;
  /** Histórico: a guia autoriza menos do que foi usado (gera risco e glosa). */
  autorizaMenos: boolean;
};

const PAGAMENTO_CONV: readonly (readonly [string | null, number])[] = [
  ["Paulista Saúde Integral", 20], ["Total Care Planos de Saúde", 15], ["Vida Plena Saúde", 18], ["Mediplan Assistência Médica", 14],
  ["Previmed Seguros Saúde", 10], ["Bem Estar Planos de Saúde", 8], [null, 12],
];

/** Itens do procedimento com a variação de cada caso (níveis, cage extra, PediGuard...). */
function itensDe(proc: ProcDef, rnd: Rnd, forcaDeixar: boolean): ItemPlano[] {
  const base: Record<string, number> = Object.fromEntries(proc.itens);
  switch (proc.key) {
    case "TLIF": {
      const n = rnd() < 0.5 ? 1 : 2;
      base["COL-1002"] = 4 * n;
      if (rnd() < 0.3) { base["COL-1001"] = 2; base["COL-1002"] = 4 * n - 2; }
      base["COL-1007"] = n;
      if (rnd() < 0.25) base["COL-1006"] = 1;
      if (rnd() < 0.3) base["DAP-6001"] = 1;
      break;
    }
    case "PERC":
      if (rnd() < 0.4) base["DAP-6001"] = 1;
      break;
    case "ACDF":
      if (rnd() < 0.35) { delete base["COL-1010"]; delete base["COL-1008"]; base["COL-1009"] = 1; }
      else if (rnd() < 0.3) base["COL-1008"] = 2;
      break;
    case "ALIF":
      if (rnd() < 0.5) { base["COL-1002"] = 4; base["COL-1004"] = 2; }
      break;
    case "ENDO":
      if (rnd() < 0.5) base["END-4002"] = 1;
      break;
    case "BLOQ":
      if (rnd() < 0.4) base["DOR-3002"] = 1;
      break;
    case "RF":
      if (rnd() < 0.3) { delete base["DOR-3003"]; base["DOR-3004"] = 2; }
      else if (rnd() < 0.15) base["DOR-3005"] = 1;
      break;
    case "VTP":
      if (rnd() < 0.5) base["VTP-5003"] = 1;
      break;
  }
  const extras: Record<string, number> = { "COL-1001": 2, "COL-1002": 2, "COL-1003": 2, "COL-1004": 1, "COL-1005": 1, "DOR-3001": 1, "DOR-3003": 1, "BIO-2001": 1, "END-4004": 1, "END-4005": 1 };
  const cages = new Set(["COL-1007", "COL-1008"]);
  return Object.entries(base).map(([cod, qtd]) => {
    const extra = extras[cod] ?? (cages.has(cod) && rnd() < 0.3 ? 1 : 0);
    const deixar = extra > 0 && (forcaDeixar ? rnd() < 0.8 : rnd() < 0.12) ? 1 : 0;
    return { cod, qtd, enviar: qtd + extra, deixar };
  });
}

function nomePaciente(rnd: Rnd, usados: Set<string>) {
  for (;;) {
    const n = `${pick(rnd, NOMES)} ${pick(rnd, SOBRENOMES)} ${pick(rnd, SOBRENOMES)}`;
    if (!usados.has(n)) { usados.add(n); return n; }
  }
}

function montar(rnd: Rnd, usados: Set<string>, d: Date, h: number, hosp: string, procKey: string, o: Partial<PlanoCirurgia> = {}): PlanoCirurgia {
  const proc = PROCEDIMENTOS.find((p) => p.key === procKey)!;
  const hd = HOSPITAIS.find((x) => x.key === hosp)!;
  const medico = o.med ?? pick(rnd, MEDICOS.filter((m) => m.areas.includes(proc.area))).key;
  const sus = o.sus ?? false;
  const conv = o.conv !== undefined ? o.conv : sus ? "SUS" : pickPeso(rnd, PAGAMENTO_CONV);
  return {
    dia: d, h, min: pick(rnd, [0, 15, 30, 45]), hosp, med: medico, conv, sus, proc: procKey, rep: rnd() < 0.1 ? pick(rnd, ["JOAO", "MARI", "RODR", "PATR"]) : hd.rep,
    paciente: nomePaciente(rnd, usados), carteirinha: conv && conv !== "SUS" ? String(entre(rnd, 100000000, 999999999)) + String(entre(rnd, 10, 99)) : null,
    itens: itensDe(proc, rnd, hosp === "GUAR"), destino: "FATURADA", confirmada: true, auth: "AUTORIZADA", autorizaMenos: false, ...o,
  };
}

export const HOJE = dia("2026-10-16");

/** Histórico: procedimentos realizados de mai a out (volume crescendo) + 2 cancelados. */
export function planejarHistorico(): PlanoCirurgia[] {
  const rnd = mulberry32(20261016);
  const usados = new Set<string>();
  const meses: [string, number, number][] = [["2026-05", 11, 31], ["2026-06", 12, 30], ["2026-07", 13, 31], ["2026-08", 15, 31], ["2026-09", 17, 30], ["2026-10", 12, 11]];
  const procPeso = PROCEDIMENTOS.map((p) => [p.key, p.peso] as const);
  const hospPeso = HOSPITAIS.filter((h) => !h.sub).map((h) => [h.key, h.peso] as const);
  const out: PlanoCirurgia[] = [];
  for (const [mes, n, ultimo] of meses) {
    for (let i = 0; i < n; i++) {
      let d: Date;
      do d = dia(`${mes}-${String(entre(rnd, 1, ultimo)).padStart(2, "0")}`);
      while (diaSemana(d) === 0 || (diaSemana(d) === 6 && rnd() > 0.06));
      const hosp = pickPeso(rnd, hospPeso);
      const susOk = hosp === "SCAS" || hosp === "OSAS";
      out.push(montar(rnd, usados, d, entre(rnd, 7, 15), hosp, pickPeso(rnd, procPeso), { sus: susOk && rnd() < 0.35 }));
    }
  }
  // últimos dias: realizados e ainda sem faturar
  for (const [ds, hosp, p] of [["2026-10-12", "VAUR", "TLIF"], ["2026-10-12", "SCEC", "BLOQ"], ["2026-10-13", "SGAB", "ACDF"], ["2026-10-13", "SLUC", "RF"], ["2026-10-14", "VAUR", "ENDO"], ["2026-10-15", "SLUC", "ENDO"], ["2026-10-15", "SGAB", "VTP"]] as const) {
    out.push(montar(rnd, usados, dia(ds), 9, hosp, p, { destino: "REALIZADA" }));
  }
  out.sort((a, b) => a.dia.getTime() - b.dia.getTime() || a.h - b.h);
  for (const p of out) if (p.dia.toISOString().slice(0, 10) >= "2026-10-12") p.destino = "REALIZADA";
  // um pedido de venda ainda sem NF
  const aberto = out.filter((p) => p.destino === "FATURADA" && p.dia.toISOString().slice(0, 10) >= "2026-10-08").slice(-1)[0];
  if (aberto) aberto.destino = "PEDIDO_ABERTO";
  // guias que autorizam menos do que foi usado (viram glosa): só em procedimentos com mais de um item
  const comConv = out.filter((p) => p.conv && p.conv !== "SUS" && p.destino === "FATURADA" && p.dia.toISOString().slice(0, 10) < "2026-09-10" && ["TLIF", "ACDF", "ALIF", "PERC", "VTP"].includes(p.proc));
  for (const i of [2, 6, 10, 14]) if (comConv[i]) comConv[i].autorizaMenos = true;
  out.push(montar(rnd, usados, dia("2026-07-14"), 10, "SGAB", "ALIF", { destino: "CANCELADA", confirmada: false }));
  out.push(montar(rnd, usados, dia("2026-09-22"), 8, "SCEC", "ENDO", { destino: "CANCELADA", confirmada: false }));
  return out.sort((a, b) => a.dia.getTime() - b.dia.getTime() || a.h - b.h);
}

/** Agenda: hoje, esta semana e os próximos dias. Nenhuma no Hospital São Vicente (inventário em andamento). */
export function planejarFuturo(): PlanoCirurgia[] {
  const rnd = mulberry32(777);
  const usados = new Set<string>(["Cláudio Roberto Fontes"]);
  const f = (ds: string, h: number, hosp: string, p: string, med: string, conv: string | null, o: Partial<PlanoCirurgia>) =>
    montar(rnd, usados, dia(ds), h, hosp, p, { med, conv, sus: conv === "SUS", min: 0, ...o });
  return [
    f("2026-10-16", 7, "SLUC", "TLIF", "BARR", "Paulista Saúde Integral", { destino: "FUTURA_ENVIADA", auth: "AUTORIZADA" }),
    f("2026-10-16", 11, "VAUR", "ACDF", "CORD", "Vida Plena Saúde", { destino: "FUTURA_ENVIADA", auth: "AUTORIZADA" }),
    f("2026-10-16", 15, "SGAB", "ENDO", "ALME", "Mediplan Assistência Médica", { destino: "FUTURA_ENVIADA", auth: "AUTORIZADA", min: 30 }),
    f("2026-10-17", 9, "SCEC", "BLOQ", "LPRA", null, { destino: "FUTURA_SEM_VALE", auth: "NENHUMA", confirmada: false }),
    f("2026-10-19", 8, "VAUR", "PERC", "TAVA", "Previmed Seguros Saúde", { destino: "FUTURA_ABERTA", auth: "SOLICITADA" }),
    f("2026-10-19", 13, "SLUC", "RF", "MVID", "Paulista Saúde Integral", { destino: "FUTURA_SEM_VALE", auth: "AUTORIZADA", confirmada: false }),
    f("2026-10-20", 9, "SGAB", "ALIF", "FONS", "Total Care Planos de Saúde", { destino: "FUTURA_SEM_VALE", auth: "SOLICITADA", confirmada: false }),
    f("2026-10-21", 7, "SCEC", "VTP", "ABRI", "Vida Plena Saúde", { destino: "FUTURA_SEM_VALE", auth: "AUTORIZADA", confirmada: false }),
    f("2026-10-21", 14, "VAUR", "ENDO", "MEND", "Bem Estar Planos de Saúde", { destino: "FUTURA_SEM_VALE", auth: "NENHUMA", confirmada: false }),
    f("2026-10-22", 10, "SLUC", "TLIF", "PACH", "Mediplan Assistência Médica", { destino: "FUTURA_SEM_VALE", auth: "NEGADA", confirmada: false }),
    f("2026-10-23", 8, "OSAS", "BLOQ", "RSOA", "SUS", { destino: "FUTURA_SEM_VALE", auth: "NENHUMA", confirmada: false }),
    f("2026-10-27", 9, "SAND", "TLIF", "FONS", null, { destino: "FUTURA_SEM_VALE", auth: "NENHUMA", confirmada: false }),
  ];
}

export type ItemVenda = { cod: string; qtd: number };
export type PlanoVenda = { dia: Date; sub: string; itens: ItemVenda[] };

/** Vendas diretas (sem cirurgia) a subdistribuidores: reposição de descartáveis, implantes, endoscopia e vertebroplastia. */
export function planejarVendasDiretas(): PlanoVenda[] {
  const rnd = mulberry32(9090);
  const subs = HOSPITAIS.filter((h) => h.sub).map((h) => h.key);
  const modelos: ((r: Rnd) => ItemVenda[])[] = [
    (r) => [{ cod: "DOR-3001", qtd: entre(r, 20, 40) }, { cod: "DOR-3002", qtd: entre(r, 10, 20) }, { cod: "DOR-3003", qtd: entre(r, 10, 20) }],
    (r) => [{ cod: "COL-1002", qtd: entre(r, 8, 16) }, { cod: "COL-1004", qtd: entre(r, 4, 8) }, { cod: "COL-1007", qtd: entre(r, 2, 4) }],
    (r) => [{ cod: "END-4001", qtd: entre(r, 3, 6) }, { cod: "END-4004", qtd: entre(r, 10, 20) }, { cod: "END-4005", qtd: entre(r, 8, 16) }],
    (r) => [{ cod: "VTP-5001", qtd: entre(r, 4, 8) }, { cod: "VTP-5002", qtd: entre(r, 4, 8) }, { cod: "BIO-2001", qtd: entre(r, 8, 16) }],
    (r) => [{ cod: "COL-1008", qtd: entre(r, 2, 4) }, { cod: "COL-1010", qtd: entre(r, 2, 4) }, { cod: "BIO-2004", qtd: entre(r, 2, 4) }, { cod: "BIO-2005", qtd: entre(r, 4, 8) }],
    (r) => [{ cod: "DOR-3004", qtd: entre(r, 4, 8) }, { cod: "DOR-3005", qtd: entre(r, 2, 4) }, { cod: "BIO-2006", qtd: entre(r, 6, 12) }],
  ];
  const meses: [string, number, number][] = [["2026-05", 3, 31], ["2026-06", 4, 30], ["2026-07", 5, 31], ["2026-08", 6, 31], ["2026-09", 6, 30], ["2026-10", 5, 14]];
  const out: PlanoVenda[] = [];
  let seq = 0;
  for (const [mes, n, ultimo] of meses) {
    for (let i = 0; i < n; i++) {
      let d: Date;
      do d = dia(`${mes}-${String(entre(rnd, 1, ultimo)).padStart(2, "0")}`);
      while (diaSemana(d) === 0 || diaSemana(d) === 6);
      const itens = [...pick(rnd, modelos)(rnd)];
      if (rnd() < 0.35) for (const x of pick(rnd, modelos)(rnd)) if (!itens.some((y) => y.cod === x.cod)) itens.push(x);
      out.push({ dia: d, sub: subs[seq++ % subs.length], itens });
    }
  }
  return out.sort((a, b) => a.dia.getTime() - b.dia.getTime());
}

export { addD };
