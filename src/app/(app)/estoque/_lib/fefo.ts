/**
 * Funções puras de FEFO (first expire, first out) — sem dependências de servidor,
 * para serem usadas tanto no editor (client) quanto nas regras de negócio.
 */
export type LoteDisp = {
  loteId: string;
  produtoId: string;
  numero: string;
  validade: string; // ISO
  disponivel: number; // saldo no depósito menos reservas de remessas ABERTAS
};

export type LinhaRemessa = { produtoId: string; loteId: string; quantidade: number };

/** 00:00 UTC do dia (validades são gravadas como data, em UTC). */
export function inicioDoDiaUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function ordenarFefo<T extends { validade: string | Date; numero: string }>(lotes: T[]) {
  return [...lotes].sort(
    (a, b) => new Date(a.validade).getTime() - new Date(b.validade).getTime() || a.numero.localeCompare(b.numero),
  );
}

/**
 * Sugere lotes por FEFO para `quantidade` do produto, dividindo entre lotes se necessário.
 * `usado` (loteId → qtd) desconta o que já foi alocado em outras linhas e é atualizado.
 */
export function sugerirFefo(
  lotes: LoteDisp[],
  produtoId: string,
  quantidade: number,
  usado: Map<string, number> = new Map(),
): { linhas: LinhaRemessa[]; faltante: number } {
  const linhas: LinhaRemessa[] = [];
  let resta = quantidade;
  for (const l of ordenarFefo(lotes.filter((x) => x.produtoId === produtoId))) {
    if (resta <= 0) break;
    const livre = l.disponivel - (usado.get(l.loteId) ?? 0);
    if (livre <= 0) continue;
    const q = Math.min(livre, resta);
    linhas.push({ produtoId, loteId: l.loteId, quantidade: q });
    usado.set(l.loteId, (usado.get(l.loteId) ?? 0) + q);
    resta -= q;
  }
  return { linhas, faltante: Math.max(resta, 0) };
}
