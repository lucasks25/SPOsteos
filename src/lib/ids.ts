/** Maior valor de uma coluna `Int` (int4) do Postgres. */
export const INT4_MAX = 2_147_483_647;

/**
 * Id inteiro vindo da URL ou de um formulário: só dígitos, de 1 a INT4_MAX.
 * Qualquer outra coisa ("abc", "-1", "1.5", "99999999999999999999") vira null, para a tela
 * responder 404 em vez de estourar o tipo da coluna no banco (erro 500).
 */
export function idInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= INT4_MAX ? v : null;
  if (typeof v !== "string" || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= INT4_MAX ? n : null;
}
