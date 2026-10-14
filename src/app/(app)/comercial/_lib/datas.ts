/** Utilitários de data do módulo comercial (horário de Brasília, UTC−03:00, sem horário de verão). */

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

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

export function hojeUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
