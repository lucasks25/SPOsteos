/** Utilitários puros da carga de demonstração (sem acesso a banco). */

export const DIA_MS = 86_400_000;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rnd = () => number;

/** Meia-noite UTC de "yyyy-mm-dd" (o formato dos dias no sistema). */
export const dia = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const addD = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Instante real de h:m (horário de Brasília) num dia UTC-meia-noite. */
export const hora = (d: Date, h: number, m = 0) => new Date(d.getTime() + (h + 3) * 3_600_000 + m * 60_000);
export const fimMes = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
export const iniMes = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const somaMes = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
export const diaSemana = (d: Date) => d.getUTCDay(); // 0 = domingo
/** Empurra sábado/domingo para a segunda seguinte. */
export const diaUtil = (d: Date) => addD(d, diaSemana(d) === 6 ? 2 : diaSemana(d) === 0 ? 1 : 0);

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const entre = (rnd: Rnd, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
export const pick = <T>(rnd: Rnd, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
export function pickPeso<T>(rnd: Rnd, itens: readonly (readonly [T, number])[]): T {
  const total = itens.reduce((s, [, p]) => s + p, 0);
  let x = rnd() * total;
  for (const [v, p] of itens) {
    x -= p;
    if (x < 0) return v;
  }
  return itens[itens.length - 1][0];
}

/** CNPJ formatado com a filial 0001 e dígitos verificadores corretos a partir de 8 dígitos. */
export function cnpj(base8: string): string {
  const d = `${base8}0001`.split("").map(Number);
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = d.reduce((acc, v, i) => acc + v * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  d.push(dv(12));
  d.push(dv(13));
  const t = d.join("");
  return `${t.slice(0, 2)}.${t.slice(2, 5)}.${t.slice(5, 8)}/${t.slice(8, 12)}-${t.slice(12)}`;
}

/** CPF formatado a partir de 9 dígitos. */
export function cpf(base9: string): string {
  const d = base9.split("").map(Number);
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(9));
  d.push(dv(10));
  const t = d.join("");
  return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`;
}

/** GTIN-13 com dígito verificador, a partir de 12 dígitos. */
export function ean13(base12: string): string {
  const s = base12.split("").reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + String((10 - (s % 10)) % 10);
}
