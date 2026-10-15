/** Vendas por mês (12 meses) com comparativo ao mesmo mês do ano anterior. Puro, testado em tests/gestao/vendas-mes.test.ts. */
export type VendaPedido = { faturadoEm: Date; total: number };
export type LinhaMes = { chave: string; ano: number; mes: number; valor: number; pedidos: number; anterior: number; pedidosAnterior: number; variacaoPct: number | null };

const cent = (n: number) => Math.round(n * 100);
const BRT = 3 * 60 * 60 * 1000;

/** Mês (ano e 1-12) de um instante, no fuso de Brasília. */
export function mesBrasilia(d: Date): { ano: number; mes: number } {
  const x = new Date(d.getTime() - BRT);
  return { ano: x.getUTCFullYear(), mes: x.getUTCMonth() + 1 };
}

const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

/** Início (instante) do mês `mes` de `ano` em Brasília. */
export function inicioMesBrasilia(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1) + BRT);
}

/** Os 12 meses terminando em `fim` (inclusive), do mais antigo ao mais novo. */
export function ultimos12Meses(fim: { ano: number; mes: number }): { ano: number; mes: number }[] {
  const out: { ano: number; mes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = fim.ano * 12 + (fim.mes - 1) - i;
    out.push({ ano: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  }
  return out;
}

/** variação % = (atual − anterior) / anterior; anterior 0 → null (não existe base de comparação). */
export function vendasPorMes(pedidos: VendaPedido[], fim: { ano: number; mes: number }): LinhaMes[] {
  const soma = new Map<string, { c: number; n: number }>();
  for (const p of pedidos) {
    const { ano, mes } = mesBrasilia(p.faturadoEm);
    const k = chave(ano, mes);
    const a = soma.get(k) ?? { c: 0, n: 0 };
    a.c += cent(p.total);
    a.n++;
    soma.set(k, a);
  }
  return ultimos12Meses(fim).map(({ ano, mes }) => {
    const atual = soma.get(chave(ano, mes)) ?? { c: 0, n: 0 };
    const ant = soma.get(chave(ano - 1, mes)) ?? { c: 0, n: 0 };
    return {
      chave: chave(ano, mes),
      ano,
      mes,
      valor: atual.c / 100,
      pedidos: atual.n,
      anterior: ant.c / 100,
      pedidosAnterior: ant.n,
      variacaoPct: ant.c > 0 ? Math.round(((atual.c - ant.c) / ant.c) * 10000) / 100 : null,
    };
  });
}

/** Janela a consultar: do primeiro dos 12 meses do comparativo (23 meses antes de `fim`) até o fim de `fim`, exclusivo. */
export function janelaVendas(fim: { ano: number; mes: number }): { gte: Date; lt: Date } {
  const idx = (m: { ano: number; mes: number }, n: number) => ({ ano: Math.floor((m.ano * 12 + m.mes - 1 + n) / 12), mes: ((m.ano * 12 + m.mes - 1 + n) % 12) + 1 });
  const ini = idx(fim, -23);
  const prox = idx(fim, 1);
  return { gte: inicioMesBrasilia(ini.ano, ini.mes), lt: inicioMesBrasilia(prox.ano, prox.mes) };
}
