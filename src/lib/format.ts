type Num = number | string | { toString(): string } | null | undefined;

export function toNumber(v: Num): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: Num) => brl.format(toNumber(v));

export const num = (v: Num) => new Intl.NumberFormat("pt-BR").format(toNumber(v));

export function date(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  // Datas "puras" (validade, vencimento) são gravadas à meia-noite UTC: exibir em UTC.
  // Instantes (criadoEm, faturadoEm...) são exibidos no horário de Brasília.
  const soData = dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;
  return dt.toLocaleDateString("pt-BR", { timeZone: soData ? "UTC" : "America/Sao_Paulo" });
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

/** yyyy-mm-dd para <input type="date"> */
export function inputDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/** yyyy-mm-ddThh:mm para <input type="datetime-local"> (horário de Brasília) */
export function inputDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000);
  return dt.toISOString().slice(0, 16);
}

/** Dias até a data (negativo = vencido). */
export function diasAte(d: Date | string) {
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Data de `n` dias atrás (n negativo = futuro). Fora de componentes para não violar a regra de pureza. */
export function diasAtras(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
