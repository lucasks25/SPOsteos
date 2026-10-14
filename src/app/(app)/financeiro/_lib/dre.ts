/**
 * DRE gerencial por competência — parte pura (sem banco), testada em tests/financeiro/dre.test.ts.
 *
 * Cada `LinhaDre` já vem com o sinal do resultado: receita e ganho positivos, despesa e perda negativos.
 * O sinal vem do lado do título (receber/pagar), não do tipo da conta: um reembolso recebido numa conta
 * de despesa (+) reduz a despesa. O tipo da conta só decide em que linha do DRE o valor aparece.
 */
export type TipoPlano = "RECEITA" | "DEDUCAO" | "CUSTO" | "DESPESA" | "RECEITA_FINANCEIRA" | "DESPESA_FINANCEIRA" | "IMPOSTO_LUCRO" | "NAO_RESULTADO";

export type LinhaDre = {
  mes: string; // "yyyy-mm"
  planoId: string | null; // null = não classificado
  tipo: TipoPlano | null;
  valor: number; // com sinal de resultado
};

export type ContaDre = { planoId: string | null; valor: number };

export type DreMes = {
  mes: string;
  receitaBruta: number;
  deducoes: number; // negativo
  receitaLiquida: number;
  custos: number; // negativo
  lucroBruto: number;
  margemBruta: number | null; // lucroBruto / receitaLiquida (null sem receita)
  despesas: number; // negativo
  resultadoOperacional: number;
  financeiro: number; // receitas financeiras + despesas financeiras (negativas)
  resultadoAntesIr: number;
  impostoLucro: number; // negativo
  naoClassificado: number;
  resultadoLiquido: number;
  /** valor por conta do plano em cada tipo, para o drill-down */
  contas: Partial<Record<TipoPlano, ContaDre[]>>;
};

const cent = (n: number) => Math.round(n * 100);
const r2 = (n: number) => cent(n) / 100;

/** "yyyy-mm" de um dia UTC (data de vencimento/competência/baixa gravada à meia-noite UTC). */
export const chaveMes = (d: Date) => d.toISOString().slice(0, 7);

/** Meses consecutivos a partir de `inicio` ("yyyy-mm"). */
export function mesesDe(inicio: string, n: number): string[] {
  const [a, m] = inicio.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

function somar(linhas: LinhaDre[], tipo: TipoPlano) {
  return r2(linhas.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valor, 0));
}

function contasDoTipo(linhas: LinhaDre[], tipo: TipoPlano): ContaDre[] {
  const por = new Map<string | null, number>();
  for (const l of linhas) if (l.tipo === tipo) por.set(l.planoId, (por.get(l.planoId) ?? 0) + l.valor);
  return [...por].map(([planoId, valor]) => ({ planoId, valor: r2(valor) }));
}

/** Monta o DRE de um mês. NAO_RESULTADO fica fora; linhas sem classificação entram em `naoClassificado`. */
export function dreDoMes(todas: LinhaDre[], mes: string): DreMes {
  const linhas = todas.filter((l) => l.mes === mes);
  const receitaBruta = somar(linhas, "RECEITA");
  const deducoes = somar(linhas, "DEDUCAO");
  const receitaLiquida = r2(receitaBruta + deducoes);
  const custos = somar(linhas, "CUSTO");
  const lucroBruto = r2(receitaLiquida + custos);
  const despesas = somar(linhas, "DESPESA");
  const resultadoOperacional = r2(lucroBruto + despesas);
  const financeiro = r2(somar(linhas, "RECEITA_FINANCEIRA") + somar(linhas, "DESPESA_FINANCEIRA"));
  const resultadoAntesIr = r2(resultadoOperacional + financeiro);
  const impostoLucro = somar(linhas, "IMPOSTO_LUCRO");
  const naoClassificado = r2(linhas.filter((l) => l.tipo === null).reduce((s, l) => s + l.valor, 0));
  const tipos: TipoPlano[] = ["RECEITA", "DEDUCAO", "CUSTO", "DESPESA", "RECEITA_FINANCEIRA", "DESPESA_FINANCEIRA", "IMPOSTO_LUCRO"];
  return {
    mes,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custos,
    lucroBruto,
    margemBruta: cent(receitaLiquida) === 0 ? null : lucroBruto / receitaLiquida,
    despesas,
    resultadoOperacional,
    financeiro,
    resultadoAntesIr,
    impostoLucro,
    naoClassificado,
    resultadoLiquido: r2(resultadoAntesIr + impostoLucro + naoClassificado),
    contas: Object.fromEntries(tipos.map((t) => [t, contasDoTipo(linhas, t)])),
  };
}

/** Soma de vários meses (coluna "Total"). */
export function dreTotal(todas: LinhaDre[], meses: string[]): DreMes {
  const set = new Set(meses);
  return dreDoMes(
    todas.filter((l) => set.has(l.mes)).map((l) => ({ ...l, mes: "total" })),
    "total",
  );
}

// ───────────── regras de sinal das baixas (juros, multa, desconto) ─────────────

export type BaixaDre = { tipo: "receber" | "pagar"; juros: number; multa: number; desconto: number };

/**
 * Efeito financeiro de uma baixa, com sinal de resultado:
 *   receber: juros+multa recebidos (+, JUROS_RECEBIDOS); desconto concedido (−, DESCONTO_CONCEDIDO)
 *   pagar:   juros+multa pagos (−, JUROS_PAGOS);         desconto obtido (+, DESCONTO_OBTIDO)
 */
export function efeitosDaBaixa(b: BaixaDre): { chave: "JUROS_RECEBIDOS" | "DESCONTO_CONCEDIDO" | "JUROS_PAGOS" | "DESCONTO_OBTIDO"; valor: number }[] {
  const juros = r2(b.juros + b.multa);
  const out: { chave: "JUROS_RECEBIDOS" | "DESCONTO_CONCEDIDO" | "JUROS_PAGOS" | "DESCONTO_OBTIDO"; valor: number }[] = [];
  if (b.tipo === "receber") {
    if (cent(juros) > 0) out.push({ chave: "JUROS_RECEBIDOS", valor: juros });
    if (cent(b.desconto) > 0) out.push({ chave: "DESCONTO_CONCEDIDO", valor: -r2(b.desconto) });
  } else {
    if (cent(juros) > 0) out.push({ chave: "JUROS_PAGOS", valor: -juros });
    if (cent(b.desconto) > 0) out.push({ chave: "DESCONTO_OBTIDO", valor: r2(b.desconto) });
  }
  return out;
}
