/**
 * Datas do financeiro. Vencimentos e datas de pagamento são gravados como
 * meia-noite UTC do dia (vindos de <input type="date">), então "hoje" também
 * é representado assim, considerando o fuso de Brasília.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

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
