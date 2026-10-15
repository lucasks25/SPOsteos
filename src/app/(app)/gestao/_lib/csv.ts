import { csv } from "../../financeiro/_lib/aging";

export { csv };

/** Resposta de download CSV (mesmos cabeçalhos do aging). */
export function respostaCsv(nome: string, linhas: (string | number)[][]): Response {
  return new Response(csv(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

/** Percentual como número (o csv() formata com vírgula; texto começando em "-" seria tratado como fórmula). */
export const pct = (v: number | null): string | number => (v === null ? "" : v);
