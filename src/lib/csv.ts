/** CSV para Excel brasileiro: separador ";", decimal com vírgula, BOM UTF-8, e neutraliza fórmulas (=, +, -, @). */
export function csv(linhas: (string | number)[][]): string {
  const cel = (v: string | number) => {
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `\ufeff${linhas.map((l) => l.map(cel).join(";")).join("\r\n")}\r\n`;
}

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
