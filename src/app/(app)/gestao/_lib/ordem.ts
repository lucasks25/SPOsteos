/**
 * Ordenação por coluna via searchParams. O valor do parâmetro é o nome da coluna ("margem") para crescente
 * ou com "-" na frente ("-margem") para decrescente. Cada tabela da tela usa o seu parâmetro (`param`).
 * A parte pura (parseOrdem, proximaOrdem, ordenar) é testada em tests/gestao/ordenar.test.ts.
 */
export type Dir = "asc" | "desc";
export type Ordem = { campo: string; dir: Dir };

/** Valor da querystring → ordem. Coluna fora da lista permitida (ou ausente) cai no padrão. */
export function parseOrdem(valor: string | string[] | undefined, permitidas: readonly string[], padrao: Ordem): Ordem {
  if (typeof valor !== "string" || !valor) return padrao;
  const dir: Dir = valor.startsWith("-") ? "desc" : "asc";
  const campo = valor.replace(/^-/, "");
  return permitidas.includes(campo) ? { campo, dir } : padrao;
}

export const serializarOrdem = (o: Ordem) => (o.dir === "desc" ? `-${o.campo}` : o.campo);

/** Clique numa coluna: se já é a ordenada, inverte; senão ordena por ela (texto começa crescente, número decrescente). */
export function proximaOrdem(atual: Ordem, campo: string, numerico: boolean): Ordem {
  if (atual.campo === campo) return { campo, dir: atual.dir === "asc" ? "desc" : "asc" };
  return { campo, dir: numerico ? "desc" : "asc" };
}

type Valor = string | number | null | undefined;

/**
 * Ordenação estável e sem mutar a entrada. Nulos/indefinidos vão sempre para o fim (em qualquer direção);
 * texto usa a ordem do português (sem diferenciar acento/caixa); empate mantém a ordem original.
 */
export function ordenar<T>(linhas: readonly T[], ordem: Ordem, acessores: Record<string, (l: T) => Valor>): T[] {
  const get = acessores[ordem.campo];
  if (!get) return [...linhas];
  const sinal = ordem.dir === "asc" ? 1 : -1;
  return linhas
    .map((l, i) => ({ l, i, v: get(l) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined;
      const bn = b.v === null || b.v === undefined;
      if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "pt-BR", { sensitivity: "base", numeric: true });
      return c !== 0 ? c * sinal : a.i - b.i;
    })
    .map((x) => x.l);
}

/** Link que mantém os demais parâmetros da página e troca só o da ordenação. */
export function hrefOrdem(base: string, sp: Record<string, string | string[] | undefined>, param: string, ordem: Ordem): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== param) u.set(k, v);
  u.set(param, serializarOrdem(ordem));
  return `${base}?${u.toString()}`;
}

