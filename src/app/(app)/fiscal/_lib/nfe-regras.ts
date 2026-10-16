/**
 * Regras fiscais da NF-e da SP OSTEOS (puras, sem banco). Fundamento e grau de certeza de cada regra: docs/NFE.md.
 *
 * O que está aqui é o PADRÃO do sistema. Tudo que depende de enquadramento (isenção do Convênio ICMS 01/99, alíquota zero
 * de PIS/COFINS, IPI do importador) tem de ser confirmado pelo contador antes da produção; a confirmação vira alteração
 * deste arquivo (e do teste tests/fiscal/nfe.test.ts), não configuração solta.
 */

export const OPERACOES = ["REMESSA_CONSIGNACAO", "RETORNO_CONSIGNACAO", "RETORNO_SIMBOLICO", "VENDA_CONSIGNADO", "VENDA", "IMPORTACAO"] as const;
export type Operacao = (typeof OPERACOES)[number];

export type RegraOperacao = {
  rotulo: string;
  natureza: string;
  /** tpNF: entrada (0) emitida pela própria empresa, ou saída (1). */
  entrada: boolean;
  /** CFOP dentro de SP, para outro estado; importação usa o mesmo nos dois. */
  cfopInterno: string;
  cfopInterestadual: string;
  /** finNFe: 1 normal, 4 devolução (exige NF referenciada). */
  finalidade: 1 | 4;
  /** Exige ao menos uma chave de NF referenciada (NFref). */
  exigeReferencia: boolean;
  /** É venda (receita): PIS/COFINS cumulativos, gera conta a receber ao autorizar. */
  venda: boolean;
};

/** Ajuste SINIEF 02/93 (consignação mercantil) e tabela CFOP (Convênio s/nº de 1970, anexo do Ajuste SINIEF 07/01). */
export const REGRAS: Record<Operacao, RegraOperacao> = {
  REMESSA_CONSIGNACAO: {
    rotulo: "Remessa em consignação",
    natureza: "Remessa de mercadoria em consignação mercantil",
    entrada: false,
    cfopInterno: "5917",
    cfopInterestadual: "6917",
    finalidade: 1,
    exigeReferencia: false,
    venda: false,
  },
  RETORNO_CONSIGNACAO: {
    rotulo: "Retorno de consignação (devolução física)",
    natureza: "Devolução de mercadoria remetida em consignação mercantil",
    entrada: true,
    cfopInterno: "1918",
    cfopInterestadual: "2918",
    finalidade: 4,
    exigeReferencia: true,
    venda: false,
  },
  RETORNO_SIMBOLICO: {
    rotulo: "Retorno simbólico (consignado vendido)",
    natureza: "Devolução simbólica de mercadoria vendida remetida em consignação mercantil",
    entrada: true,
    cfopInterno: "1919",
    cfopInterestadual: "2919",
    finalidade: 4,
    exigeReferencia: true,
    venda: false,
  },
  VENDA_CONSIGNADO: {
    rotulo: "Venda do consignado",
    natureza: "Venda de mercadoria remetida anteriormente em consignação mercantil",
    entrada: false,
    cfopInterno: "5114",
    cfopInterestadual: "6114",
    finalidade: 1,
    exigeReferencia: true,
    venda: true,
  },
  VENDA: {
    rotulo: "Venda direta",
    natureza: "Venda de mercadoria adquirida de terceiros",
    entrada: false,
    cfopInterno: "5102",
    cfopInterestadual: "6102",
    finalidade: 1,
    exigeReferencia: false,
    venda: true,
  },
  IMPORTACAO: {
    rotulo: "Entrada de importação",
    natureza: "Compra para comercialização - importação",
    entrada: true,
    cfopInterno: "3102",
    cfopInterestadual: "3102",
    finalidade: 1,
    exigeReferencia: false,
    venda: false,
  },
};

export const UF_EMITENTE = "SP";

/** idDest: 1 operação interna, 2 interestadual, 3 com exterior. */
export function destinoOperacao(op: Operacao, ufDestinatario: string): 1 | 2 | 3 {
  if (op === "IMPORTACAO") return 3;
  return ufDestinatario.toUpperCase() === UF_EMITENTE ? 1 : 2;
}

export function cfopDaOperacao(op: Operacao, ufDestinatario: string): string {
  const r = REGRAS[op];
  return destinoOperacao(op, ufDestinatario) === 2 ? r.cfopInterestadual : r.cfopInterno;
}

// ───────────────────────── ICMS ─────────────────────────

/** Alíquota interna de SP (RICMS/SP art. 52, I): 18%. */
export const ALIQ_INTERNA_SP = 18;
/** Estados do Sul e Sudeste, exceto o Espírito Santo: 12%; demais e ES: 7% (Resolução do Senado 22/1989). */
const SUL_SUDESTE_SEM_ES = new Set(["MG", "RJ", "PR", "SC", "RS"]);

/** Origem estrangeira (0 nacional; 1, 2, 3 e 8 com conteúdo importado acima de 40%): 4% interestadual (Resolução do Senado 13/2012). */
export function origemImportada(origem: number) {
  return origem === 1 || origem === 2 || origem === 3 || origem === 8;
}

export function aliquotaIcms(op: Operacao, ufDestinatario: string, origem: number): number {
  const dest = destinoOperacao(op, ufDestinatario);
  if (dest !== 2) return ALIQ_INTERNA_SP;
  if (origemImportada(origem)) return 4;
  return SUL_SUDESTE_SEM_ES.has(ufDestinatario.toUpperCase()) ? 12 : 7;
}

// ───────────────────────── Enquadramento por NCM ─────────────────────────

/**
 * Enquadramento tributário de um NCM. `isentoIcms`: Convênio ICMS 01/99 (equipamentos e insumos para a saúde), internalizado
 * em SP no RICMS/SP Anexo I. `pisCofinsZero`: Lei 10.865/2004, art. 8º, §12 (importação) e art. 28 (mercado interno).
 * A lista padrão abaixo é CONSERVADORA: só entra o que a pesquisa (docs/NFE.md §3) achou na letra da norma. NCM fora daqui
 * sai tributado e a montagem avisa ("enquadramento não confirmado").
 */
export type Enquadramento = {
  isentoIcms: boolean;
  /** Código de benefício fiscal (cBenef) exigido quando o CST indica benefício; nulo se não houver. */
  cBenef: string | null;
  pisCofinsZero: boolean;
  /** Alíquota de IPI da TIPI (só importa na saída de produto de importação direta: importador equiparado a industrial). */
  aliquotaIpi: number;
  fonte: string;
};

/** Prefixos de NCM (mais longo vence). Atualize junto com docs/NFE.md §3 quando o contador confirmar. */
export const ENQUADRAMENTO_PADRAO: Record<string, Enquadramento> = {
  "9021": {
    isentoIcms: true,
    cBenef: null,
    pisCofinsZero: true,
    aliquotaIpi: 0,
    fonte: "Conv. ICMS 01/99 (lista do anexo); Lei 10.865/2004 art. 8º §12 VI e art. 28 IV; TIPI cap. 90 — CONFIRMAR item a item",
  },
};

export const ENQUADRAMENTO_TRIBUTADO: Enquadramento = { isentoIcms: false, cBenef: null, pisCofinsZero: false, aliquotaIpi: 0, fonte: "padrão: tributado" };

export function enquadramentoDoNcm(ncm: string, tabela: Record<string, Enquadramento> = ENQUADRAMENTO_PADRAO): { e: Enquadramento; confirmado: boolean } {
  for (let n = ncm.length; n >= 2; n--) {
    const e = tabela[ncm.slice(0, n)];
    if (e) return { e, confirmado: true };
  }
  return { e: ENQUADRAMENTO_TRIBUTADO, confirmado: false };
}

// ───────────────────────── CST por operação ─────────────────────────

/** Lucro Presumido: PIS/COFINS cumulativos (Lei 9.718/1998): 0,65% e 3%. */
export const ALIQ_PIS = 0.65;
export const ALIQ_COFINS = 3;

export type Cst = { icms: string; ipi: string; pis: string; cofins: string; aliqIcms: number; aliqIpi: number; aliqPis: number; aliqCofins: number };

/**
 * CSTs do item. ICMS: 00 tributada, 40 isenta, 41 não tributada, 50 suspensão. IPI: 50 saída tributada, 51 saída com alíquota
 * zero, 53 saída não tributada, 49 outras entradas, 99 outras saídas, 00 entrada com crédito. PIS/COFINS: 01 tributável,
 * 06 alíquota zero, 49 outras saídas, 70 aquisição sem crédito, 98 outras entradas, 99 outras operações.
 */
export function cstDoItem(op: Operacao, enq: Enquadramento, origem: number, ufDestinatario: string): Cst {
  const r = REGRAS[op];
  const aliq = enq.isentoIcms ? 0 : aliquotaIcms(op, ufDestinatario, origem);
  const icms = enq.isentoIcms ? "40" : "00";
  // IPI: só o importador (origem 1, importação direta) é equiparado a industrial na saída (RIPI, Decreto 7.212/2010, art. 9º, I).
  const importadorDireto = origem === 1;
  let ipi: string;
  let aliqIpi = 0;
  if (r.entrada) ipi = op === "IMPORTACAO" ? (enq.aliquotaIpi > 0 ? "00" : "01") : "49";
  else if (!importadorDireto) ipi = "53";
  else if (enq.aliquotaIpi > 0) {
    ipi = "50";
    aliqIpi = enq.aliquotaIpi;
  } else ipi = "51";
  // PIS/COFINS: receita só na venda. Remessa/retorno não são receita; importação no presumido não dá crédito.
  let pis: string;
  let aliqPis = 0;
  let aliqCofins = 0;
  if (r.venda) {
    if (enq.pisCofinsZero) pis = "06";
    else {
      pis = "01";
      aliqPis = ALIQ_PIS;
      aliqCofins = ALIQ_COFINS;
    }
  } else if (op === "IMPORTACAO") pis = "70";
  else pis = r.entrada ? "98" : "49";
  if (op === "IMPORTACAO") aliqIpi = enq.aliquotaIpi;
  return { icms, ipi, pis, cofins: pis, aliqIcms: aliq, aliqIpi, aliqPis, aliqCofins };
}
