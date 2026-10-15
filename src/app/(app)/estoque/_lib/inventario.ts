/**
 * Regras PURAS do inventário de consignado (sem banco): divergência, resumo e plano de movimento.
 * Valores em reais com 2 casas; o produto é feito em centavos inteiros para não acumular erro de ponto flutuante.
 */

export type Resolucao = "AJUSTE" | "COBRAR_HOSPITAL" | "JUSTIFICADA";
export type Situacao = "NAO_CONTADO" | "OK" | "FALTA" | "SOBRA";

export const ROTULO_RESOLUCAO: Record<Resolucao, string> = {
  AJUSTE: "Ajustar saldo",
  COBRAR_HOSPITAL: "Cobrar do hospital",
  JUSTIFICADA: "Justificada (sem ajuste)",
};

const centavos = (v: number) => Math.round(v * 100);
/** quantidade × valor unitário, arredondado em centavos (meio para cima em módulo). */
export const valorLinha = (quantidade: number, valorUnit: number) => (quantidade * centavos(valorUnit)) / 100;

export type EntradaItem = {
  saldoSistema: number; // foto
  saldoAtual: number; // saldo real agora no local do hospital
  contado: number | null;
  valorUnit: number;
};

export type ResultadoItem = {
  situacao: Situacao;
  /** contado − saldo ATUAL (é isto que o fechamento corrige); null se não contado */
  diferenca: number | null;
  /** contado − saldo da foto (o que o contador "viu" ao conferir) */
  diferencaFoto: number | null;
  /** o saldo do sistema andou depois da foto (remessa, retorno, consumo...) */
  saldoMudou: boolean;
  /** diferença × custo médio congelado; negativo = falta */
  valor: number;
};

export function calcularItem(i: EntradaItem): ResultadoItem {
  const saldoMudou = i.saldoAtual !== i.saldoSistema;
  if (i.contado === null) return { situacao: "NAO_CONTADO", diferenca: null, diferencaFoto: null, saldoMudou, valor: 0 };
  const diferenca = i.contado - i.saldoAtual;
  return {
    situacao: diferenca === 0 ? "OK" : diferenca < 0 ? "FALTA" : "SOBRA",
    diferenca,
    diferencaFoto: i.contado - i.saldoSistema,
    saldoMudou,
    valor: valorLinha(diferenca, i.valorUnit),
  };
}

export type Resumo = {
  itens: number;
  contados: number;
  naoContados: number;
  divergentes: number;
  unidadesFalta: number;
  unidadesSobra: number;
  /** valor das faltas ao custo (positivo) */
  valorFalta: number;
  valorSobra: number;
  /** quantos itens tiveram o saldo alterado depois da foto */
  saldoMudou: number;
};

export function resumirInventario(resultados: ResultadoItem[]): Resumo {
  let falta = 0;
  let sobra = 0;
  let vFalta = 0;
  let vSobra = 0;
  let divergentes = 0;
  let contados = 0;
  let mudou = 0;
  for (const r of resultados) {
    if (r.saldoMudou) mudou++;
    if (r.situacao === "NAO_CONTADO") continue;
    contados++;
    if (r.situacao === "FALTA") {
      divergentes++;
      falta += -(r.diferenca ?? 0);
      vFalta += -r.valor;
    } else if (r.situacao === "SOBRA") {
      divergentes++;
      sobra += r.diferenca ?? 0;
      vSobra += r.valor;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    itens: resultados.length,
    contados,
    naoContados: resultados.length - contados,
    divergentes,
    unidadesFalta: falta,
    unidadesSobra: sobra,
    valorFalta: r2(vFalta),
    valorSobra: r2(vSobra),
    saldoMudou: mudou,
  };
}

/** Mensagem de erro se a resolução não serve para a divergência; null se válida. */
export function validarResolucao(diferenca: number, resolucao: Resolucao | null | undefined, justificativa: string | null | undefined): string | null {
  if (diferenca === 0) return null;
  if (!resolucao) return "Escolha a resolução da divergência.";
  if (resolucao === "JUSTIFICADA" && !(justificativa ?? "").trim()) return "Informe a justificativa.";
  if (resolucao === "COBRAR_HOSPITAL" && diferenca > 0) return "Cobrar do hospital só vale para falta; sobra deve ser ajustada ou justificada.";
  return null;
}

export type PlanoMovimento = { tipo: "AJUSTE" | "PERDA"; entrada: boolean; quantidade: number } | null;

/**
 * Movimento de estoque que corrige o saldo, ou null se a resolução não mexe nele.
 * Sobra: AJUSTE de entrada. Falta ajustada: PERDA (material sumiu); falta cobrada: AJUSTE de saída
 * (o hospital responde pelo valor, então não entra como perda da distribuidora).
 */
export function planoMovimento(diferenca: number, resolucao: Resolucao | null | undefined): PlanoMovimento {
  if (diferenca === 0 || !resolucao || resolucao === "JUSTIFICADA") return null;
  if (diferenca > 0) return { tipo: "AJUSTE", entrada: true, quantidade: diferenca };
  return { tipo: resolucao === "COBRAR_HOSPITAL" ? "AJUSTE" : "PERDA", entrada: false, quantidade: -diferenca };
}

/** Valor a cobrar do hospital: só para falta cobrada (positivo). */
export function valorACobrar(diferenca: number, valorUnit: number, resolucao: Resolucao | null | undefined): number | null {
  return resolucao === "COBRAR_HOSPITAL" && diferenca < 0 ? valorLinha(-diferenca, valorUnit) : null;
}
