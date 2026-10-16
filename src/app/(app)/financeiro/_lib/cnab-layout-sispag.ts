/**
 * Tabelas de campos do SISPAG Itaú CNAB 240, transcritas DIRETAMENTE do manual
 * "SISPAG — Layout de Arquivos — CNAB Versão 085" (outubro/2020, docs/manuais/itau-sispag-cnab240.pdf).
 * Cada campo traz a página/nota do manual. NÃO importar nada de sispag.ts: o validador tem de ser independente.
 *
 * Convenção do manual (item 2.2.1): picture X = alfanumérico alinhado à esquerda com brancos;
 * picture 9 = numérico alinhado à direita com zeros; campo não usado = brancos (X) ou zeros (9).
 * (*) = campo que só consta no retorno; na remessa vai com brancos ou zeros conforme a picture.
 */
import { FINALIDADES_TED, FORMAS_PAGAMENTO, MOVIMENTOS, TIPOS_PAGAMENTO } from "./cnab-validador-regras";

export type Picture = "9" | "X";
export type TipoSemantico = "data" | "data-opcional" | "hora" | "valor" | "ocorrencias";

export type Campo = {
  ini: number;
  fim: number;
  nome: string;
  pic: Picture;
  /** Conteúdo exigido exatamente (ex.: "341", "040", brancos). */
  fixo?: string;
  /** Valores permitidos. */
  dominio?: readonly string[];
  /** "aviso" quando o manual diz que valor fora do domínio não rejeita (ex.: finalidade TED, nota 26). */
  dominioAviso?: boolean;
  /** Não pode ficar vazio (só brancos / só zeros). */
  obrig?: boolean;
  /** (*) só no retorno. */
  soRetorno?: boolean;
  tipo?: TipoSemantico;
  /** Aceita minúsculas (e-mail, chave Pix, URL). */
  caixaLivre?: boolean;
  /** Ocorrência da nota 8 que o Itaú devolveria. */
  ocorr?: string;
  ref: string;
};

export type Layout = { id: string; nome: string; ref: string; campos: Campo[] };

const brancos = (n: number) => " ".repeat(n);
const zeros = (n: number) => "0".repeat(n);
const B = (ini: number, fim: number, ref: string): Campo => ({ ini, fim, nome: "BRANCOS (complemento de registro)", pic: "X", fixo: brancos(fim - ini + 1), ref });
const Z = (ini: number, fim: number, ref: string): Campo => ({ ini, fim, nome: "ZEROS (complemento de registro)", pic: "9", fixo: zeros(fim - ini + 1), ref });
const x = (ini: number, fim: number, nome: string, ref: string, extra: Partial<Campo> = {}): Campo => ({ ini, fim, nome, pic: "X", ref, ...extra });
const n = (ini: number, fim: number, nome: string, ref: string, extra: Partial<Campo> = {}): Campo => ({ ini, fim, nome, pic: "9", ref, ...extra });
const INSCRICAO = ["1", "2"] as const;

/** 001-014 comuns a todo detalhe (tipo 3). */
const inicioDetalhe = (seg: string, ref: string): Campo[] => [
  n(1, 3, "CÓDIGO DO BANCO", ref, { fixo: "341" }),
  n(4, 7, "CÓDIGO DO LOTE", `${ref}, nota 3`, { ocorr: "AG" }),
  n(8, 8, "TIPO DE REGISTRO", ref, { fixo: "3" }),
  n(9, 13, "NÚMERO DO REGISTRO", `${ref}, nota 9`, { ocorr: "AH" }),
  x(14, 14, "SEGMENTO", ref, { fixo: seg }),
];
const ocorrencias = (ref: string) => x(231, 240, "OCORRÊNCIAS", `${ref}, nota 8`, { soRetorno: true, tipo: "ocorrencias" });
const movimento = (ref: string) => n(15, 17, "TIPO DE MOVIMENTO", `${ref}, nota 10`, { dominio: MOVIMENTOS, ocorr: "AJ" });

/** Empresa debitada: posições 018-032 e 053-102, iguais nos headers (nota 1). */
const empresa = (ref: string, comLancamento: boolean): Campo[] => [
  n(18, 18, "EMPRESA – TIPO DE INSCRIÇÃO", ref, { dominio: INSCRICAO, ocorr: "CK" }),
  n(19, 32, "EMPRESA – NÚMERO DE INSCRIÇÃO", `${ref}, nota 1`, { obrig: true, ocorr: "CI" }),
  ...(comLancamento ? [x(33, 36, "IDENTIFICAÇÃO DO LANÇAMENTO", `${ref}, nota 13`), B(37, 52, ref)] : [B(33, 52, ref)]),
  n(53, 57, "AGÊNCIA DEBITADA", `${ref}, nota 1`, { obrig: true }),
  B(58, 58, ref),
  n(59, 70, "CONTA DEBITADA", `${ref}, nota 1`, { obrig: true }),
  B(71, 71, ref),
  n(72, 72, "DAC DA AGÊNCIA/CONTA DEBITADA", `${ref}, nota 1`),
  x(73, 102, "NOME DA EMPRESA", ref, { obrig: true }),
];

export const HEADER_ARQUIVO: Layout = {
  id: "header-arquivo", nome: "Header de arquivo", ref: "p. 12",
  campos: [
    n(1, 3, "CÓDIGO DO BANCO", "p. 12", { fixo: "341", ocorr: "HM" }),
    n(4, 7, "CÓDIGO DO LOTE", "p. 12", { fixo: "0000", ocorr: "HM" }),
    n(8, 8, "TIPO DE REGISTRO", "p. 12", { fixo: "0", ocorr: "HM" }),
    B(9, 14, "p. 12"),
    n(15, 17, "LAYOUT DE ARQUIVO", "p. 12", { fixo: "080", ocorr: "HM" }),
    n(18, 18, "EMPRESA – TIPO DE INSCRIÇÃO", "p. 12", { dominio: INSCRICAO, ocorr: "HM" }),
    n(19, 32, "EMPRESA – NÚMERO DE INSCRIÇÃO", "p. 12, nota 1", { obrig: true, ocorr: "HM" }),
    B(33, 52, "p. 12"),
    n(53, 57, "AGÊNCIA DEBITADA", "p. 12, nota 1", { obrig: true, ocorr: "HM" }),
    B(58, 58, "p. 12"),
    n(59, 70, "CONTA DEBITADA", "p. 12, nota 1", { obrig: true, ocorr: "HM" }),
    B(71, 71, "p. 12"),
    n(72, 72, "DAC DA AGÊNCIA/CONTA DEBITADA", "p. 12, nota 1"),
    x(73, 102, "NOME DA EMPRESA", "p. 12", { obrig: true }),
    x(103, 132, "NOME DO BANCO", "p. 12"),
    B(133, 142, "p. 12"),
    n(143, 143, "ARQUIVO-CÓDIGO (1 = remessa, 2 = retorno)", "p. 12", { dominio: ["1", "2"], ocorr: "HM" }),
    n(144, 151, "DATA DE GERAÇÃO", "p. 12", { tipo: "data", ocorr: "HM" }),
    n(152, 157, "HORA DE GERAÇÃO", "p. 12", { tipo: "hora", ocorr: "HM" }),
    Z(158, 166, "p. 12"),
    n(167, 171, "UNIDADE DE DENSIDADE", "p. 12, nota 2 (teleprocessamento = zeros)", { fixo: "00000" }),
    B(172, 240, "p. 12"),
  ],
};

const headerLote = (layoutLote: "040" | "030", ref: string): Layout => ({
  id: `header-lote-${layoutLote}`,
  nome: layoutLote === "040" ? "Header de lote (cheque, OP, DOC, TED, Pix, crédito em conta)" : "Header de lote (boletos e Pix QR Code)",
  ref,
  campos: [
    n(1, 3, "CÓDIGO DO BANCO", ref, { fixo: "341" }),
    n(4, 7, "CÓDIGO DO LOTE", `${ref}, nota 3`, { ocorr: "AG" }),
    n(8, 8, "TIPO DE REGISTRO", ref, { fixo: "1" }),
    x(9, 9, "TIPO DE OPERAÇÃO", ref, { dominio: ["C", "F"] }),
    n(10, 11, "TIPO DE PAGAMENTO", `${ref}, nota 4`, { dominio: TIPOS_PAGAMENTO, ocorr: "IM" }),
    n(12, 13, "FORMA DE PAGAMENTO", `${ref}, nota 5`, { dominio: FORMAS_PAGAMENTO, ocorr: "IM" }),
    n(14, 16, "LAYOUT DO LOTE", ref, { fixo: layoutLote }),
    B(17, 17, ref),
    ...empresa(ref, layoutLote === "040"),
    x(103, 132, "FINALIDADE DO LOTE", `${ref}, nota 6`),
    x(133, 142, "HISTÓRICO DE C/C", `${ref}, nota 7`),
    x(143, 172, "ENDEREÇO DA EMPRESA", ref),
    n(173, 177, "NÚMERO DO LOCAL", ref),
    x(178, 192, "COMPLEMENTO", ref),
    x(193, 212, "CIDADE", ref),
    n(213, 220, "CEP", ref),
    x(221, 222, "ESTADO", ref),
    B(223, 230, ref),
    ocorrencias(ref),
  ],
});
export const HEADER_LOTE_040 = headerLote("040", "p. 13");
export const HEADER_LOTE_030 = headerLote("030", "p. 25");

export const SEGMENTO_A: Layout = {
  id: "segmento-A", nome: "Segmento A", ref: "p. 15",
  campos: [
    ...inicioDetalhe("A", "p. 15"),
    movimento("p. 15"),
    n(18, 20, "CÂMARA CENTRALIZADORA", "p. 15, nota 35", { dominio: ["000", "009", "888"] }),
    n(21, 23, "BANCO FAVORECIDO", "p. 15", { ocorr: "AL" }),
    x(24, 43, "AGÊNCIA CONTA FAVORECIDO", "p. 15, nota 11"),
    x(44, 73, "NOME DO FAVORECIDO", "p. 15, nota 34", { obrig: true, ocorr: "AO" }),
    x(74, 93, "SEU NÚMERO", "p. 15"),
    n(94, 101, "DATA DE PAGTO", "p. 15", { tipo: "data", ocorr: "AP" }),
    x(102, 104, "MOEDA – TIPO", "p. 15", { dominio: ["REA", "009"] }),
    x(105, 112, "CÓDIGO ISPB", "p. 15, nota 35"),
    x(113, 114, "IDENTIFICAÇÃO TRANSFERÊNCIA", "p. 15, nota 36"),
    Z(115, 119, "p. 15"),
    n(120, 134, "VALOR DO PAGTO", "p. 15", { tipo: "valor", ocorr: "AR" }),
    x(135, 149, "NOSSO NÚMERO", "p. 15, nota 12", { ocorr: "BC" }),
    x(150, 154, "COMPLEMENTO (agência conta pagamento)", "p. 15, nota 42"),
    n(155, 162, "DATA EFETIVA", "p. 15", { soRetorno: true, tipo: "data-opcional" }),
    n(163, 177, "VALOR EFETIVO", "p. 15", { soRetorno: true }),
    x(178, 197, "FINALIDADE DETALHE", "p. 15, nota 13"),
    n(198, 203, "Nº DO DOCUMENTO (DOC/TED/OP)", "p. 15, nota 14", { soRetorno: true }),
    n(204, 217, "Nº DE INSCRIÇÃO DO FAVORECIDO", "p. 15, nota 15", { ocorr: "BI" }),
    x(218, 219, "FINALIDADE DOC / STATUS FUNCIONÁRIO", "p. 15, nota 30"),
    x(220, 224, "FINALIDADE TED", "p. 15, nota 26", { dominio: ["     ", ...FINALIDADES_TED], dominioAviso: true }),
    B(225, 229, "p. 15"),
    x(230, 230, "AVISO AO FAVORECIDO", "p. 15, nota 16", { dominio: ["0", "3", "5", "9"] }),
    ocorrencias("p. 15"),
  ],
};

export const SEGMENTO_B: Layout = {
  id: "segmento-B", nome: "Segmento B", ref: "p. 17",
  campos: [
    ...inicioDetalhe("B", "p. 17"),
    B(15, 17, "p. 17"),
    n(18, 18, "TIPO INSCRIÇÃO DO FAVORECIDO", "p. 17", { dominio: INSCRICAO, ocorr: "BI" }),
    n(19, 32, "Nº DE INSCRIÇÃO DO FAVORECIDO", "p. 17, nota 15", { ocorr: "BI" }),
    x(33, 62, "ENDEREÇO", "p. 17"),
    n(63, 67, "NÚMERO", "p. 17"),
    x(68, 82, "COMPLEMENTO", "p. 17"),
    x(83, 97, "BAIRRO", "p. 17"),
    x(98, 117, "CIDADE", "p. 17"),
    n(118, 125, "CEP", "p. 17"),
    x(126, 127, "ESTADO", "p. 17"),
    x(128, 227, "E-MAIL", "p. 17, nota 23", { caixaLivre: true, ocorr: "DM" }),
    B(228, 230, "p. 17"),
    ocorrencias("p. 17"),
  ],
};

export const SEGMENTO_B_PIX: Layout = {
  id: "segmento-B-pix", nome: "Segmento B (Pix)", ref: "p. 18",
  campos: [
    ...inicioDetalhe("B", "p. 18"),
    x(15, 16, "TIPO CHAVE PIX", "p. 18, nota 37", { dominio: ["  ", "01", "02", "03", "04"] }),
    B(17, 17, "p. 18"),
    n(18, 18, "TIPO INSCRIÇÃO DO FAVORECIDO", "p. 18", { dominio: INSCRICAO, ocorr: "BI" }),
    n(19, 32, "Nº DE INSCRIÇÃO DO FAVORECIDO", "p. 18, nota 15", { obrig: true, ocorr: "BI" }),
    B(33, 62, "p. 18"),
    n(63, 127, "INFORMAÇÃO ENTRE USUÁRIOS", "p. 18, nota 39"),
    x(128, 227, "CHAVE PIX", "p. 18, nota 40", { caixaLivre: true }),
    B(228, 230, "p. 18"),
    ocorrencias("p. 18"),
  ],
};

const valoresC: [number, number, string][] = [
  [46, 60, "VALOR DOCUMENTO"], [61, 75, "VALOR PIS"], [76, 90, "VALOR I.R."], [91, 105, "VALOR I.S.S."], [106, 120, "VALOR COFINS"],
  [121, 135, "DESCONTO"], [136, 150, "ABATIMENTO"], [151, 165, "OUTRAS DEDUÇÕES"], [166, 180, "MORA"], [181, 195, "MULTA"], [196, 210, "OUTROS ACRÉSCIMOS"],
];
export const SEGMENTO_C: Layout = {
  id: "segmento-C", nome: "Segmento C", ref: "p. 19",
  campos: [
    ...inicioDetalhe("C", "p. 19"),
    n(15, 29, "VALOR C.S.L.L.", "p. 19"),
    B(30, 37, "p. 19"),
    x(38, 45, "VENCIMENTO", "p. 19"),
    ...valoresC.map(([i, f, nm]) => n(i, f, nm, "p. 19")),
    x(211, 230, "FATURA/DOCUMENTO", "p. 19"),
    B(231, 240, "p. 19"),
  ],
};

export const SEGMENTO_Z: Layout = {
  id: "segmento-Z", nome: "Segmento Z (autenticação, só no retorno)", ref: "p. 23",
  campos: [
    ...inicioDetalhe("Z", "p. 23"),
    x(15, 78, "AUTENTICAÇÃO", "p. 23"),
    x(79, 98, "SEU NÚMERO", "p. 23"),
    B(99, 103, "p. 23"),
    x(104, 118, "NOSSO NÚMERO", "p. 23"),
    B(119, 240, "p. 23"),
  ],
};

export const SEGMENTO_J: Layout = {
  id: "segmento-J", nome: "Segmento J", ref: "p. 26",
  campos: [
    ...inicioDetalhe("J", "p. 26"),
    movimento("p. 26"),
    n(18, 20, "CÓD. BARRAS – BANCO FAVORECIDO", "p. 26, nota 18", { ocorr: "IP" }),
    n(21, 21, "CÓD. BARRAS – MOEDA", "p. 26, nota 18, Anexo A", { ocorr: "IP" }),
    n(22, 22, "CÓD. BARRAS – DV", "p. 26, nota 18, Anexo A item 3", { ocorr: "IP" }),
    n(23, 26, "CÓD. BARRAS – FATOR DE VENCIMENTO", "p. 26, nota 18", { ocorr: "IP" }),
    n(27, 36, "CÓD. BARRAS – VALOR", "p. 26, nota 18", { ocorr: "IP" }),
    n(37, 61, "CÓD. BARRAS – CAMPO LIVRE", "p. 26, nota 18", { ocorr: "IP" }),
    x(62, 91, "NOME DO FAVORECIDO", "p. 26", { obrig: true, ocorr: "AO" }),
    n(92, 99, "DATA VENCTO (NOMINAL)", "p. 26", { tipo: "data", ocorr: "II" }),
    n(100, 114, "VALOR DO TÍTULO (NOMINAL)", "p. 26", { ocorr: "IB" }),
    n(115, 129, "DESCONTOS + ABATIMENTO", "p. 26", { ocorr: "ID" }),
    n(130, 144, "ACRÉSCIMOS (MORA + MULTA)", "p. 26", { ocorr: "IH" }),
    n(145, 152, "DATA PAGAMENTO", "p. 26", { tipo: "data", ocorr: "AP" }),
    n(153, 167, "VALOR PAGAMENTO", "p. 26", { tipo: "valor", ocorr: "AR" }),
    Z(168, 182, "p. 26"),
    x(183, 202, "SEU NÚMERO", "p. 26"),
    B(203, 215, "p. 26"),
    x(216, 230, "NOSSO NÚMERO", "p. 26, nota 12", { ocorr: "BC" }),
    ocorrencias("p. 26"),
  ],
};

const inicioJ52 = (ref: string): Campo[] => [
  ...inicioDetalhe("J", ref),
  movimento(ref),
  n(18, 19, "CÓDIGO DO REGISTRO OPCIONAL", ref, { fixo: "52" }),
  n(20, 20, "TIPO INSCRIÇÃO SACADO (pagador)", ref, { dominio: INSCRICAO, ocorr: "BI" }),
  n(21, 35, "NÚMERO INSCRIÇÃO SACADO", ref, { ocorr: "BI" }),
  x(36, 75, "NOME SACADO", ref),
  n(76, 76, "TIPO INSCRIÇÃO CEDENTE (beneficiário)", ref, { dominio: INSCRICAO, ocorr: "BI" }),
  n(77, 91, "NÚMERO INSCRIÇÃO CEDENTE", ref, { obrig: true, ocorr: "BI" }),
  x(92, 131, "NOME CEDENTE", ref),
];

export const SEGMENTO_J52: Layout = {
  id: "segmento-J52", nome: "Segmento J-52", ref: "p. 27",
  campos: [
    ...inicioJ52("p. 27"),
    n(132, 132, "TIPO INSCRIÇÃO SACADOR AVALISTA", "p. 27", { dominio: ["0", "1", "2"] }),
    n(133, 147, "NÚMERO INSCRIÇÃO SACADOR AVALISTA", "p. 27"),
    x(148, 187, "NOME SACADOR AVALISTA", "p. 27"),
    B(188, 240, "p. 27"),
  ],
};

export const SEGMENTO_J52_PIX: Layout = {
  id: "segmento-J52-pix", nome: "Segmento J-52 Pix", ref: "p. 28",
  campos: [
    ...inicioJ52("p. 28"),
    x(132, 208, "URL / CHAVE PIX", "p. 28, nota 41", { obrig: true, caixaLivre: true }),
    x(209, 240, "TXID", "p. 28, nota 38", { caixaLivre: true }),
  ],
};

/** Trailer de lote das formas com segmento A (p. 24) e J (p. 32): mesmo leiaute. */
export const TRAILER_LOTE: Layout = {
  id: "trailer-lote", nome: "Trailer de lote", ref: "p. 24 / p. 32",
  campos: [
    n(1, 3, "CÓDIGO DO BANCO", "p. 24", { fixo: "341" }),
    n(4, 7, "CÓDIGO DO LOTE", "p. 24, nota 3", { ocorr: "AG" }),
    n(8, 8, "TIPO DE REGISTRO", "p. 24", { fixo: "5" }),
    B(9, 17, "p. 24"),
    n(18, 23, "TOTAL QTDE REGISTROS", "p. 24, nota 17", { ocorr: "TA" }),
    n(24, 41, "TOTAL VALOR PAGTOS", "p. 24, nota 17", { ocorr: "TA" }),
    Z(42, 59, "p. 24"),
    B(60, 230, "p. 24"),
    ocorrencias("p. 24"),
  ],
};

export const TRAILER_ARQUIVO: Layout = {
  id: "trailer-arquivo", nome: "Trailer de arquivo", ref: "p. 43",
  campos: [
    n(1, 3, "CÓDIGO DO BANCO", "p. 43", { fixo: "341" }),
    n(4, 7, "CÓDIGO DO LOTE", "p. 43", { fixo: "9999" }),
    n(8, 8, "TIPO DE REGISTRO", "p. 43", { fixo: "9" }),
    B(9, 17, "p. 43"),
    n(18, 23, "TOTAL QTDE DE LOTES", "p. 43, nota 17"),
    n(24, 29, "TOTAL QTDE REGISTROS", "p. 43, nota 17"),
    B(30, 240, "p. 43"),
  ],
};

export const LAYOUTS_SISPAG = [
  HEADER_ARQUIVO, HEADER_LOTE_040, HEADER_LOTE_030, SEGMENTO_A, SEGMENTO_B, SEGMENTO_B_PIX, SEGMENTO_C, SEGMENTO_Z,
  SEGMENTO_J, SEGMENTO_J52, SEGMENTO_J52_PIX, TRAILER_LOTE, TRAILER_ARQUIVO,
];

/** Confere que cada layout cobre 1..240 sem buraco nem sobreposição (erro de transcrição). */
export function conferirCobertura(l: Layout): string | null {
  const usado = Array<number>(241).fill(0);
  for (const c of l.campos) for (let p = c.ini; p <= c.fim; p++) usado[p]++;
  for (let p = 1; p <= 240; p++) if (usado[p] !== 1) return `${l.nome}: posição ${p} ${usado[p] === 0 ? "sem campo" : "em dois campos"}`;
  return null;
}
