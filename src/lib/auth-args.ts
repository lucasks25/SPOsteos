import { ErroNegocio } from "@/lib/erros";
import { idInt } from "@/lib/ids";

/**
 * Validação dos argumentos "soltos" de Server Actions (os ligados com `.bind(null, id)` e os chamados direto do cliente).
 *
 * Por que existe: o tipo TypeScript não vale em tempo de execução. Quem conhece o id da action pode chamá-la por POST
 * com qualquer valor serializável no lugar do id, inclusive um objeto. O Prisma aceita objeto-operador em filtros
 * não únicos: `updateMany({ where: { id: { not: "" } } })` atinge TODAS as linhas. Exemplo real (docs/REVISAO.md §19,
 * achado S1): `desfazerConciliacao({ not: "" })` desfazia todas as conciliações de uma vez.
 *
 * Regra (verificada por tests/seguranca/actions-guarda.test.ts): todo parâmetro de action que não seja o estado
 * anterior (`_: ActionState`) nem o `FormData` passa por uma destas funções antes de qualquer outro uso.
 */
export class ArgumentoInvalido extends ErroNegocio {
  constructor() {
    super("Parâmetro inválido.");
  }
}

/** cuid, ou ids fixos do seed como "local-deposito". */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function argId(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) throw new ArgumentoInvalido();
  return v;
}

export function argIdOuNulo(v: unknown): string | null {
  return v === null || v === undefined ? null : argId(v);
}

/** Id inteiro (coluna int4): 1..2147483647. */
export function argInt(v: unknown): number {
  const n = typeof v === "number" ? idInt(v) : null;
  if (n === null) throw new ArgumentoInvalido();
  return n;
}

export function argIntOuNulo(v: unknown): number | null {
  return v === null || v === undefined ? null : argInt(v);
}

export function argBool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new ArgumentoInvalido();
  return v;
}

export function argEnum<T extends string>(v: unknown, valores: readonly T[]): T {
  if (typeof v !== "string" || !(valores as readonly string[]).includes(v)) throw new ArgumentoInvalido();
  return v as T;
}
