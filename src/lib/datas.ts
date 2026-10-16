/**
 * Datas do financeiro. Vencimentos e datas de pagamento são gravados como
 * meia-noite UTC do dia (vindos de <input type="date">), então "hoje" também
 * é representado assim, considerando o fuso de Brasília.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 3 * 60 * 60 * 1000;

/** Meia-noite UTC do dia (em America/Sao_Paulo) em que cai o instante `d`. */
export function diaBrasilia(d: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return new Date(`${ymd}T00:00:00Z`);
}

/** Meia-noite UTC do dia corrente em America/Sao_Paulo. */
export function hojeUTC(): Date {
  return diaBrasilia(new Date());
}

export function addDias(d: Date, n: number) {
  return new Date(d.getTime() + n * DIA_MS);
}

export function inicioMes(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMeses(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** Segunda-feira da semana (UTC) que contém `d`. */
export function inicioSemana(d: Date) {
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return addDias(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -dow);
}

/** Converte "yyyy-mm-dd" (querystring) em Date UTC; inválido vira null. */
export function parseDia(s: string | string[] | undefined): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "yyyy-mm-dd" */
export function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Instante real de início do dia em Brasília (UTC-3) para um dia UTC-meia-noite. */
export function inicioDiaBrasilia(diaUTC: Date) {
  return new Date(diaUTC.getTime() + 3 * 60 * 60 * 1000);
}

/** dd/mm */
export function diaMes(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** "out/26" */
export function mesAno(d: Date) {
  const m = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return `${m}/${String(d.getUTCFullYear()).slice(2)}`;
}

// --- Horário de Brasília (UTC−03:00, sem horário de verão): instantes e strings yyyy-mm-dd ---

/** Converte o valor de um <input type="datetime-local"> (horário de Brasília) em Date. */
export function parseDataHoraSP(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** yyyy-mm-dd do dia (em Brasília) de um instante. */
export function diaSP(d: Date): string {
  return new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Meia-noite (Brasília) de um dia yyyy-mm-dd. */
export function inicioDiaSP(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

/** Soma dias a um yyyy-mm-dd. */
export function somaDias(dia: string, n: number): string {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de um yyyy-mm-dd (ou de hoje, em Brasília). */
export function segundaDaSemana(dia?: string): string {
  const base = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`)) ? dia : diaSP(new Date());
  const dow = new Date(`${base}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return somaDias(base, dow === 0 ? -6 : 1 - dow);
}

/** Intervalo [início, fim) para filtros de período por datas yyyy-mm-dd (inclusive). */
export function periodo(de?: string, ate?: string) {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  return {
    gte: ok(de) ? inicioDiaSP(de!) : undefined,
    lt: ok(ate) ? inicioDiaSP(somaDias(ate!, 1)) : undefined,
  };
}

/** Meia-noite de hoje em Brasília como instante real (UTC−3). */
export function hojeSP() {
  const agora = new Date(Date.now() - OFFSET_MS);
  return new Date(`${agora.toISOString().slice(0, 10)}T00:00:00-03:00`);
}
