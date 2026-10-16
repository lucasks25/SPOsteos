/**
 * Glosas por convênio e motivo. Puro, testado em tests/gestao/glosas.test.ts. Tudo em centavos inteiros.
 * - "Glosado" é o valor BRUTO das glosas registradas no período (inclui as revertidas depois, que continuam no histórico);
 *   o líquido (glosado − revertidas) vai à parte. Percentuais: valor ÷ faturado, 2 casas; faturado zero → null (sem divisão por zero).
 * - Faturado = pedidos de venda FATURADOS no período (data da NF), glosado = glosas com data no período. Os dois recortes
 *   são independentes (a glosa costuma chegar semanas depois da NF), então o % de um período curto é uma aproximação.
 */
import { CATEGORIAS_GLOSA, type CategoriaGlosaKey, type RecursoGlosaKey } from "../../financeiro/_lib/glosa-categorias";

export type PedidoFaturadoGlosa = { convenioId: string | null; convenio: string; hospitalId: string; hospital: string; total: number };
export type GlosaLinha = { valor: number; categoria: CategoriaGlosaKey; recurso: RecursoGlosaKey; convenioId: string | null; convenio: string; hospitalId: string | null; hospital: string };

export type LinhaCategoria = { categoria: CategoriaGlosaKey; valor: number; qtd: number; pctDoTotal: number | null };
export type LinhaOrigem = { id: string; nome: string; faturado: number; glosado: number; qtd: number; pct: number | null };
export type ResumoGlosas = {
  faturado: number;
  glosado: number;
  qtd: number;
  pct: number | null;
  emRecurso: { valor: number; qtd: number };
  revertidas: { valor: number; qtd: number };
  mantidas: { valor: number; qtd: number };
  liquido: number;
  porCategoria: LinhaCategoria[];
  porConvenio: LinhaOrigem[];
  porHospital: LinhaOrigem[];
};

const cent = (n: number) => Math.round(n * 100);
const reais = (c: number) => c / 100;
/** a ÷ b em %, 2 casas; b ≤ 0 → null. Em centavos, para não somar erro de ponto flutuante. */
export const percentual = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 10000) / 100 : null);

export const SEM_CONVENIO = "sem-convenio";

export function resumirGlosas(pedidos: PedidoFaturadoGlosa[], glosas: GlosaLinha[]): ResumoGlosas {
  const faturadoC = pedidos.reduce((s, p) => s + cent(p.total), 0);
  const glosadoC = glosas.reduce((s, g) => s + cent(g.valor), 0);
  const soma = (r: RecursoGlosaKey) => {
    const x = glosas.filter((g) => g.recurso === r);
    return { valor: reais(x.reduce((s, g) => s + cent(g.valor), 0)), qtd: x.length };
  };
  const revertidas = soma("REVERTIDA");

  const porCategoria: LinhaCategoria[] = CATEGORIAS_GLOSA.map((categoria) => {
    const x = glosas.filter((g) => g.categoria === categoria);
    const c = x.reduce((s, g) => s + cent(g.valor), 0);
    return { categoria, valor: reais(c), qtd: x.length, pctDoTotal: percentual(c, glosadoC) };
  })
    .filter((l) => l.qtd > 0)
    .sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria));

  const agrupar = (chave: (x: { convenioId: string | null; hospitalId: string | null }) => string, nome: (x: { convenio: string; hospital: string }) => string): LinhaOrigem[] => {
    const m = new Map<string, { nome: string; fat: number; glo: number; qtd: number }>();
    const get = (id: string, n: string) => m.get(id) ?? m.set(id, { nome: n, fat: 0, glo: 0, qtd: 0 }).get(id)!;
    for (const p of pedidos) get(chave(p), nome(p)).fat += cent(p.total);
    for (const g of glosas) {
      const a = get(chave(g), nome(g));
      a.glo += cent(g.valor);
      a.qtd++;
    }
    return [...m].map(([id, a]) => ({ id, nome: a.nome, faturado: reais(a.fat), glosado: reais(a.glo), qtd: a.qtd, pct: percentual(a.glo, a.fat) })).sort((a, b) => b.glosado - a.glosado || a.nome.localeCompare(b.nome, "pt-BR"));
  };

  return {
    faturado: reais(faturadoC),
    glosado: reais(glosadoC),
    qtd: glosas.length,
    pct: percentual(glosadoC, faturadoC),
    emRecurso: soma("EM_RECURSO"),
    revertidas,
    mantidas: soma("MANTIDA"),
    liquido: reais(glosadoC - cent(revertidas.valor)),
    porCategoria,
    porConvenio: agrupar((x) => x.convenioId ?? SEM_CONVENIO, (x) => x.convenio),
    porHospital: agrupar((x) => x.hospitalId ?? "sem-hospital", (x) => x.hospital),
  };
}
