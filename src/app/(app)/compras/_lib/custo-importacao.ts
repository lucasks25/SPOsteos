/**
 * Custo nacionalizado (landed cost) de um pedido de compra de importação. Módulo PURO: sem banco, testável.
 *
 * Custo do item = valor do item em reais (quantidade × preço na moeda × câmbio)
 *               + rateio das despesas que INTEGRAM o custo (frete, seguro, II, AFRMM, despachante...).
 * Custo unitário nacionalizado = custo da linha ÷ quantidade.
 *
 * Base contábil: CPC 16 (R1), item 11 — o custo de aquisição do estoque inclui o preço de compra, os impostos de
 * importação e outros tributos (exceto os recuperáveis junto ao fisco), transporte, seguro e manuseio.
 *
 * Toda a conta é feita em CENTAVOS inteiros (BigInt onde o produto pode estourar 2^53), para não perder centavo:
 * - valor em reais da linha = arredondamento de quantidade × preço × câmbio;
 * - cada despesa é rateada proporcionalmente à base (valor, quantidade ou peso), truncando no centavo; o último item
 *   recebe a sobra, então a soma fecha exatamente na despesa e nenhum item fica negativo.
 */

import { ErroNegocio } from "@/lib/erros";

export const TIPOS_DESPESA = [
  "FRETE_INTERNACIONAL",
  "SEGURO",
  "II",
  "IPI",
  "PIS_IMPORTACAO",
  "COFINS_IMPORTACAO",
  "ICMS",
  "AFRMM",
  "DESPACHANTE",
  "ARMAZENAGEM",
  "CAPATAZIA",
  "TRANSPORTE_NACIONAL",
  "OUTRA",
] as const;
export type TipoDespesa = (typeof TIPOS_DESPESA)[number];

export const ROTULO_DESPESA: Record<TipoDespesa, string> = {
  FRETE_INTERNACIONAL: "Frete internacional",
  SEGURO: "Seguro internacional",
  II: "Imposto de Importação (II)",
  IPI: "IPI na importação",
  PIS_IMPORTACAO: "PIS-Importação",
  COFINS_IMPORTACAO: "COFINS-Importação",
  ICMS: "ICMS na importação",
  AFRMM: "AFRMM (marinha mercante)",
  DESPACHANTE: "Despachante / honorários",
  ARMAZENAGEM: "Armazenagem",
  CAPATAZIA: "Capatazia / THC",
  TRANSPORTE_NACIONAL: "Transporte nacional",
  OUTRA: "Outra despesa",
};

/**
 * Tributos que costumam ser RECUPERÁVEIS (crédito na escrita fiscal) para um importador no Lucro Real,
 * contribuinte de ICMS e equiparado a industrial para o IPI: por padrão NÃO integram o custo do estoque.
 * No Lucro Presumido/Simples (sem crédito de PIS/COFINS) ou com saída isenta de ICMS (ex.: Convênio ICMS 01/99,
 * que obriga estornar o crédito), o usuário marca "integra o custo" na despesa. Confirmar com o contador.
 */
export const TRIBUTOS_RECUPERAVEIS: readonly TipoDespesa[] = ["IPI", "PIS_IMPORTACAO", "COFINS_IMPORTACAO", "ICMS"];

/** Padrão de "integra o custo" por tipo: tudo integra, menos os tributos normalmente recuperáveis. */
export const integraCustoPadrao = (tipo: TipoDespesa) => !TRIBUTOS_RECUPERAVEIS.includes(tipo);

export const CRITERIOS_RATEIO = ["VALOR", "QUANTIDADE", "PESO"] as const;
export type CriterioRateio = (typeof CRITERIOS_RATEIO)[number];
export const ROTULO_CRITERIO: Record<CriterioRateio, string> = { VALOR: "Por valor", QUANTIDADE: "Por quantidade", PESO: "Por peso" };

export const MOEDAS = ["BRL", "USD", "EUR", "CNY", "GBP", "CHF", "JPY"] as const;
export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

export class CustoImportacaoError extends ErroNegocio {}

export type ItemCusto = {
  id: string;
  quantidade: number;
  /** preço unitário na moeda do pedido (até 4 casas) */
  precoMoeda: number;
  /** peso líquido TOTAL da linha, em kg (só exigido se alguma despesa ratear por peso) */
  pesoKg?: number | null;
};

export type DespesaCusto = {
  id: string;
  tipo: TipoDespesa;
  /** valor em reais (2 casas) */
  valor: number;
  integraCusto: boolean;
  criterio: CriterioRateio;
  /** despesa só deste item (ex.: II de uma adição/NCM específica); vazio = rateia entre todos */
  itemId?: string | null;
};

export type LinhaCusto = {
  id: string;
  quantidade: number;
  precoMoeda: number;
  /** quantidade × preço, na moeda do pedido */
  valorMoeda: number;
  /** valor da linha em reais, em centavos */
  valorReaisCent: number;
  /** soma do rateio das despesas que integram o custo, em centavos */
  rateioCent: number;
  /** valorReaisCent + rateioCent */
  totalCent: number;
  /** custo unitário nacionalizado com 4 casas (totalCent / quantidade / 100) */
  custoUnit: number;
  /** rateio por despesa (id → centavos) */
  porDespesa: Record<string, number>;
};

export type ResultadoCusto = {
  linhas: LinhaCusto[];
  totalMercadoriaCent: number;
  totalRateadoCent: number;
  /** despesas que não integram o custo (tributos recuperáveis etc.), em centavos */
  naoIntegraCent: number;
  totalCent: number;
};

const ESCALA_PRECO = BigInt(10000); // 4 casas
const ESCALA_CAMBIO = BigInt(1000000); // 6 casas

const paraEscala = (n: number, escala: bigint, oQue: string) => {
  if (!Number.isFinite(n) || n < 0) throw new CustoImportacaoError(`${oQue} inválido.`);
  return BigInt(Math.round(n * Number(escala)));
};
/** divisão inteira com arredondamento meio-para-cima (números não negativos) */
const divArred = (a: bigint, b: bigint) => (a * BigInt(2) + b) / (b * BigInt(2));

export const centavos = (reais: number) => Math.round(reais * 100);
export const reais = (cent: number) => cent / 100;

/** Valor da linha em reais (centavos): quantidade × preço × câmbio, arredondado uma única vez. */
export function valorEmReaisCent(quantidade: number, precoMoeda: number, cambio: number): number {
  const p = paraEscala(precoMoeda, ESCALA_PRECO, "Preço");
  const c = paraEscala(cambio, ESCALA_CAMBIO, "Câmbio");
  // centavos = q × p/1e4 × c/1e6 × 100 = q × p × c / 1e8
  return Number(divArred(BigInt(quantidade) * p * c, ESCALA_PRECO * ESCALA_CAMBIO / BigInt(100)));
}

/**
 * Rateia `totalCent` pelas bases (inteiros ≥ 0): cada item recebe o valor proporcional truncado no centavo e o ÚLTIMO
 * item com base recebe a sobra (fica com até n−1 centavos a mais). Itens com base 0 recebem 0; a soma é exata.
 */
export function ratear(totalCent: number, bases: bigint[]): number[] {
  const soma = bases.reduce((a, b) => a + b, BigInt(0));
  if (totalCent === 0) return bases.map(() => 0);
  if (soma === BigInt(0)) throw new CustoImportacaoError("Não há base para ratear a despesa (valores, quantidades ou pesos zerados).");
  const total = BigInt(totalCent);
  let ultimo = -1;
  bases.forEach((b, k) => {
    if (b > BigInt(0)) ultimo = k;
  });
  const partes = bases.map((b, k) => (k === ultimo ? 0 : Number((total * b) / soma)));
  partes[ultimo] = totalCent - partes.reduce((a, b) => a + b, 0);
  return partes;
}

function baseDo(item: ItemCusto, criterio: CriterioRateio, valorCent: number, rotulo: string): bigint {
  if (criterio === "QUANTIDADE") return BigInt(item.quantidade);
  if (criterio === "VALOR") return BigInt(valorCent);
  if (item.pesoKg == null) throw new CustoImportacaoError(`Informe o peso de todos os itens para ratear "${rotulo}" por peso.`);
  return paraEscala(item.pesoKg, BigInt(1000), "Peso"); // gramas
}

/** Calcula o custo nacionalizado de cada linha. `cambio` = 1 para pedido em reais. */
export function calcularCustoImportacao(itens: ItemCusto[], despesas: DespesaCusto[], cambio: number): ResultadoCusto {
  if (itens.length === 0) throw new CustoImportacaoError("O pedido não tem itens.");
  if (!(cambio > 0)) throw new CustoImportacaoError("Informe o câmbio (maior que zero).");
  for (const i of itens) {
    if (!Number.isInteger(i.quantidade) || i.quantidade < 1) throw new CustoImportacaoError("Quantidade de item inválida.");
  }
  const valores = itens.map((i) => valorEmReaisCent(i.quantidade, i.precoMoeda, cambio));
  const rateio = itens.map(() => 0);
  const porDespesa = itens.map(() => ({}) as Record<string, number>);
  let naoIntegra = 0;
  let rateado = 0;

  for (const d of despesas) {
    const valor = centavos(d.valor);
    if (!(valor >= 0)) throw new CustoImportacaoError("Valor de despesa inválido.");
    if (!d.integraCusto) {
      naoIntegra += valor;
      continue;
    }
    const rotulo = ROTULO_DESPESA[d.tipo] ?? d.tipo;
    if (d.itemId && !itens.some((i) => i.id === d.itemId)) throw new CustoImportacaoError(`A despesa "${rotulo}" aponta para um item que não é deste pedido.`);
    const bases = itens.map((it, k) => (d.itemId && d.itemId !== it.id ? BigInt(0) : baseDo(it, d.criterio, valores[k], rotulo)));
    const partes = ratear(valor, bases);
    partes.forEach((p, k) => {
      rateio[k] += p;
      if (p) porDespesa[k][d.id] = p;
    });
    rateado += valor;
  }

  const linhas = itens.map((i, k): LinhaCusto => {
    const totalCent = valores[k] + rateio[k];
    return {
      id: i.id,
      quantidade: i.quantidade,
      precoMoeda: i.precoMoeda,
      valorMoeda: Math.round(i.quantidade * i.precoMoeda * 10000) / 10000,
      valorReaisCent: valores[k],
      rateioCent: rateio[k],
      totalCent,
      custoUnit: Math.round((totalCent / i.quantidade) * 100) / 10000,
      porDespesa: porDespesa[k],
    };
  });
  const totalMercadoriaCent = valores.reduce((a, b) => a + b, 0);
  return { linhas, totalMercadoriaCent, totalRateadoCent: rateado, naoIntegraCent: naoIntegra, totalCent: totalMercadoriaCent + rateado };
}

/**
 * Valor (centavos) que corresponde às primeiras `k` unidades de uma linha cujo total é `totalCent` para `quantidade` unidades.
 * Recebimentos parciais usam a diferença `acumulado(depois) − acumulado(antes)`: a soma dos recebimentos fecha exatamente no
 * total da linha, sem perder centavo, qualquer que seja a ordem e o tamanho das entregas.
 */
export function valorAcumuladoCent(totalCent: number, quantidade: number, k: number): number {
  if (k <= 0) return 0;
  if (k >= quantidade) return totalCent;
  return Number(divArred(BigInt(totalCent) * BigInt(k), BigInt(quantidade)));
}

/** Valor em centavos de um recebimento de `qtd` unidades quando já haviam sido recebidas `recebidoAntes`. */
export const valorRecebimentoCent = (totalCent: number, quantidade: number, recebidoAntes: number, qtd: number) =>
  valorAcumuladoCent(totalCent, quantidade, recebidoAntes + qtd) - valorAcumuladoCent(totalCent, quantidade, recebidoAntes);
