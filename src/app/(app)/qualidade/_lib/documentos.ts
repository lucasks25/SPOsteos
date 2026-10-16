import type { Perfil } from "@/generated/prisma/client";
import { addDias } from "@/app/(app)/financeiro/_lib/datas";

/**
 * Regras puras de documentos e licenças (sem banco, sem servidor): situação por validade, filtros e rótulos.
 * Datas de validade são gravadas como meia-noite UTC do dia (vindas de <input type="date">); "hoje" vem de
 * hojeUTC() (financeiro/_lib/datas.ts), que é o dia corrente em Brasília no mesmo formato.
 */

export const TIPOS = ["AFE", "LICENCA_SANITARIA", "CBPAD", "ALVARA", "CERTIFICADO_BPF", "AUTORIZACAO_COMERCIALIZACAO", "REGISTRO_ANVISA", "IFU", "LAUDO", "CONTRATO", "OUTRO"] as const;
export type TipoDoc = (typeof TIPOS)[number];
export const ESCOPOS = ["EMPRESA", "FORNECEDOR", "FABRICANTE", "PRODUTO"] as const;
export type EscopoDoc = (typeof ESCOPOS)[number];

export const ROTULO_TIPO: Record<TipoDoc, string> = {
  AFE: "AFE ANVISA",
  LICENCA_SANITARIA: "Licença sanitária",
  CBPAD: "Certificado de boas práticas (CBPAD/BPDA)",
  ALVARA: "Alvará",
  CERTIFICADO_BPF: "Certificado de BPF",
  AUTORIZACAO_COMERCIALIZACAO: "Autorização de comercialização",
  REGISTRO_ANVISA: "Registro ANVISA",
  IFU: "IFU / instruções de uso",
  LAUDO: "Laudo",
  CONTRATO: "CNPJ / contrato",
  OUTRO: "Outro",
};
export const ROTULO_ESCOPO: Record<EscopoDoc, string> = { EMPRESA: "Empresa", FORNECEDOR: "Fornecedor", FABRICANTE: "Fabricante", PRODUTO: "Produto" };

export const SITUACOES = ["VENCIDO", "VENCE_EM_30", "VENCE_EM_90", "VIGENTE", "SEM_VENCIMENTO"] as const;
export type SituacaoDoc = (typeof SITUACOES)[number];
export const ROTULO_SITUACAO: Record<SituacaoDoc, string> = {
  VENCIDO: "Vencido",
  VENCE_EM_30: "Vence em até 30 dias",
  VENCE_EM_90: "Vence em até 90 dias",
  VIGENTE: "Vigente",
  SEM_VENCIMENTO: "Sem vencimento",
};
/** Filtro extra da tela: tudo que pede ação (vencido ou vencendo em 30 dias) — o mesmo critério do sino. */
export const FILTRO_ATENCAO = "ATENCAO";

const DIA = 24 * 60 * 60 * 1000;

/** Dias inteiros de `hoje` até a validade (negativo = vencido há N dias; 0 = vence hoje, ainda vale). */
export function diasParaVencer(validade: Date, hoje: Date) {
  return Math.round((validade.getTime() - hoje.getTime()) / DIA);
}

/** Situação pela validade. O último dia de validade ainda vale (vence hoje = VENCE_EM_30). */
export function situacaoDocumento(validade: Date | null | undefined, hoje: Date): SituacaoDoc {
  if (!validade) return "SEM_VENCIMENTO";
  const d = diasParaVencer(validade, hoje);
  if (d < 0) return "VENCIDO";
  if (d <= 30) return "VENCE_EM_30";
  if (d <= 90) return "VENCE_EM_90";
  return "VIGENTE";
}

/** Condição Prisma sobre `validade` equivalente a cada situação (mesmos limites de situacaoDocumento). */
export function filtroValidade(situacao: SituacaoDoc | typeof FILTRO_ATENCAO, hoje: Date) {
  const em30 = addDias(hoje, 30);
  const em90 = addDias(hoje, 90);
  switch (situacao) {
    case "VENCIDO": return { validade: { lt: hoje } };
    case "VENCE_EM_30": return { validade: { gte: hoje, lte: em30 } };
    case "VENCE_EM_90": return { validade: { gt: em30, lte: em90 } };
    case "VIGENTE": return { validade: { gt: em90 } };
    case "SEM_VENCIMENTO": return { validade: null };
    case FILTRO_ATENCAO: return { validade: { lte: em30 } };
  }
}

/** Texto curto para o selo: "vencido há 3 d", "vence em 12 d", "vence hoje". */
export function textoSituacao(validade: Date | null | undefined, hoje: Date) {
  const s = situacaoDocumento(validade, hoje);
  if (s === "SEM_VENCIMENTO") return "Sem vencimento";
  if (s === "VIGENTE") return "Vigente";
  const d = diasParaVencer(validade!, hoje);
  if (d < 0) return `Vencido há ${-d} d`;
  return d === 0 ? "Vence hoje" : `Vence em ${d} d`;
}

export const COR_SITUACAO: Record<SituacaoDoc, "red" | "yellow" | "blue" | "green" | "gray"> = {
  VENCIDO: "red", VENCE_EM_30: "yellow", VENCE_EM_90: "blue", VIGENTE: "green", SEM_VENCIMENTO: "gray",
};

/** A pior situação de um conjunto (para o selo resumo dos cadastros); sem documentos = null. */
export function piorSituacao(validades: (Date | null)[], hoje: Date): SituacaoDoc | null {
  if (validades.length === 0) return null;
  const ordem = SITUACOES;
  return validades.map((v) => situacaoDocumento(v, hoje)).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0];
}

/** Escopo ↔ chave da FK correspondente. */
export const CAMPO_FK = { EMPRESA: null, FORNECEDOR: "fornecedorId", FABRICANTE: "fabricanteId", PRODUTO: "produtoId" } as const;

export type AlvoDoc = { escopo: EscopoDoc; fornecedorId?: string | null; fabricanteId?: string | null; produtoId?: string | null };

/** Confere "exatamente a FK do escopo preenchida" (espelho do CHECK do banco, para dar mensagem amigável). Devolve o motivo ou null. */
export function erroDoAlvo(a: AlvoDoc): string | null {
  const preenchidas = (["fornecedorId", "fabricanteId", "produtoId"] as const).filter((k) => !!a[k]);
  const campo = CAMPO_FK[a.escopo];
  if (campo === null) return preenchidas.length === 0 ? null : "Documento da empresa não se vincula a fornecedor, fabricante ou produto.";
  if (!a[campo]) return `Selecione o ${ROTULO_ESCOPO[a.escopo].toLowerCase()} do documento.`;
  if (preenchidas.length !== 1) return "Informe apenas o vínculo do escopo escolhido.";
  return null;
}

/** Mesmo documento lógico (para renovação): mesmo tipo, escopo e vínculo. */
export function mesmoAlvo(a: AlvoDoc & { tipo: string }, b: AlvoDoc & { tipo: string }) {
  return a.tipo === b.tipo && a.escopo === b.escopo && (a.fornecedorId ?? null) === (b.fornecedorId ?? null) && (a.fabricanteId ?? null) === (b.fabricanteId ?? null) && (a.produtoId ?? null) === (b.produtoId ?? null);
}

/** Perfis que consultam documentos (e baixam arquivos) e perfis que criam/editam. ADMIN sempre passa. */
export const PERFIS_VER_DOCUMENTOS: Perfil[] = ["QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"];
export const PERFIS_EDITAR_DOCUMENTOS: Perfil[] = ["QUALIDADE"];
export const podeVerDocumentos = (p: Perfil) => p === "ADMIN" || PERFIS_VER_DOCUMENTOS.includes(p);
export const podeEditarDocumentos = (p: Perfil) => p === "ADMIN" || PERFIS_EDITAR_DOCUMENTOS.includes(p);
