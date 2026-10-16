/**
 * searchParams do Next vêm como `string | string[]` (parâmetro repetido na URL, ex.: ?q=a&q=b, vira array).
 * As telas tratam cada filtro como texto: um array quebrava `.trim()`, `.toLowerCase()` etc. (erro 500).
 * Aceita só string; parâmetro repetido vira undefined (filtro ignorado).
 */
export function soStrings<T extends object>(sp: T): T {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, typeof v === "string" ? v : undefined])) as T;
}
