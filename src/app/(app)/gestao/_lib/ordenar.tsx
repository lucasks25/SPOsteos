import Link from "next/link";
import type { ReactNode } from "react";
import { hrefOrdem, proximaOrdem, type Ordem } from "./ordem";

export { hrefOrdem, ordenar, parseOrdem, proximaOrdem, serializarOrdem, type Dir, type Ordem } from "./ordem";

/** Cabeçalho de coluna ordenável: use dentro do `head` do <Table>. */
export function ThOrdenavel({
  base,
  sp,
  param,
  campo,
  atual,
  numerico = false,
  children,
}: {
  base: string;
  sp: Record<string, string | string[] | undefined>;
  param: string;
  campo: string;
  atual: Ordem;
  numerico?: boolean;
  children: ReactNode;
}) {
  const ativa = atual.campo === campo;
  const prox = proximaOrdem(atual, campo, numerico);
  return (
    <Link
      href={hrefOrdem(base, sp, param, prox)}
      scroll={false}
      aria-sort={ativa ? (atual.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 hover:text-teal-700 ${ativa ? "text-teal-700" : ""} ${numerico ? "w-full justify-end" : ""}`}
    >
      {children}
      <span aria-hidden="true" className="text-xs">{ativa ? (atual.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </Link>
  );
}
