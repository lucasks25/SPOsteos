import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { resumoErroParaLog } from "@/lib/log-seguro";

/** Estado padrão retornado por Server Actions usadas com useActionState. */
export type ActionState = { ok?: boolean; aviso?: string; error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Converte FormData em objeto simples (strings vazias viram undefined). */
export function formToObject(fd: FormData) {
  const obj: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") obj[k] = v.trim() === "" ? undefined : v.trim();
  }
  return obj;
}

/**
 * Valida FormData com um schema zod.
 *   const parsed = parseForm(schema, fd);
 *   if (!parsed.success) return parsed.state;
 *   parsed.data ...
 */
export function parseForm<T extends z.ZodType>(schema: T, fd: FormData):
  | { success: true; data: z.infer<T> }
  | { success: false; state: ActionState } {
  const result = schema.safeParse(formToObject(fd));
  if (result.success) return { success: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  // Erro dentro de uma lista de itens (JSON num hidden, ex.: "itens.0.quantidade") não tem campo para destacar:
  // vira a mensagem principal, dizendo qual item corrigir.
  const aninhado = result.error.issues.find((i) => i.path.length > 1 && typeof i.path[1] === "number");
  if (aninhado) return { success: false, state: { error: `Item ${(aninhado.path[1] as number) + 1}: ${aninhado.message}`, fieldErrors } };
  return { success: false, state: { error: "Verifique os campos destacados.", fieldErrors } };
}

/** Limites de campo: acima disso a coluna estoura (Decimal(14,2) / int4) e o usuário veria "Erro inesperado". */
export const VALOR_MAX = 999_999_999_999.99;
export const QTD_MAX = 1_000_000;
export const TEXTO_MAX = 5000;
export const NOME_MAX = 200; // nome, título, descrição curta
export const OBS_MAX = 2000; // observação, descrição longa
/** Ano 0001 ou 9999 digitado por engano vira vencimento/validade absurdos (e quebra relatórios). */
const dataPlausivel = (d: Date) => d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2100;
/** "yyyy-mm-dd" real: recusa "2026-02-31" (o Date nativo viraria 03/03) e qualquer outro formato. */
export function diaIsoValido(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const campoData = (msg: string) => z.string({ error: msg }).refine(diaIsoValido, "Data inválida").pipe(z.coerce.date({ error: msg }));

/** Helpers zod para campos de formulário */
export const zf = {
  text: (msg = "Obrigatório", max = TEXTO_MAX) => z.string({ error: msg }).min(1, msg).max(max, `Texto muito longo (máximo ${max.toLocaleString("pt-BR")} caracteres)`),
  /** nome/título/descrição curta (até NOME_MAX) */
  nome: (msg = "Obrigatório") => zf.text(msg, NOME_MAX),
  /** campo opcional: vazio vira null (limpa o valor ao editar) */
  optText: (max = TEXTO_MAX) => z.string().max(max, `Texto muito longo (máximo ${max.toLocaleString("pt-BR")} caracteres)`).optional().transform((v) => v ?? null),
  /** observação/descrição longa (até OBS_MAX) */
  obs: () => zf.optText(OBS_MAX),
  int: (min = 0, max = QTD_MAX) => z.coerce.number({ error: "Número inválido" }).int("Deve ser inteiro").min(min, `Mínimo ${min}`).max(max, `Máximo ${max.toLocaleString("pt-BR")}`),
  money: () => z.coerce.number({ error: "Valor inválido" }).min(0, "Não pode ser negativo").max(VALOR_MAX, "Valor acima do limite do sistema"),
  date: (msg = "Data obrigatória") => campoData(msg).refine(dataPlausivel, "Data fora do intervalo aceito (1900 a 2100)"),
  optDate: () => campoData("Data inválida").refine(dataPlausivel, "Data fora do intervalo aceito (1900 a 2100)").optional().transform((v) => v ?? null),
  optMoney: () => z.coerce.number({ error: "Valor inválido" }).min(0, "Não pode ser negativo").max(VALOR_MAX, "Valor acima do limite do sistema").optional().transform((v) => v ?? null),
  bool: () => z.preprocess((v) => v === "on" || v === "true", z.boolean()),
};

/** Registra ação no log de auditoria (não interrompe o fluxo se falhar). */
export async function audit(usuarioId: string | null, acao: string, entidade: string, entidadeId?: string | number, detalhes?: string) {
  try {
    await db.logAuditoria.create({
      data: { usuarioId, acao, entidade, entidadeId: entidadeId?.toString(), detalhes },
    });
  } catch (e) {
    console.error("Falha ao registrar auditoria:", resumoErroParaLog(e));
  }
}

/**
 * Auditoria de LEITURA de dado sensível (paciente, carteirinha; docs/LGPD.md §5): uma linha "visualizar" por abertura
 * de tela de detalhe, impresso ou exportação. Não usar em listas (volume). Roda no servidor, no momento em que o dado
 * sai: um efeito no navegador seria pulado por quem baixa a página direto. O pré-carregamento do <Link> não renderiza
 * estas páginas (há src/app/(app)/loading.tsx; node_modules/next/dist/docs/01-app/02-guides/prefetching.md); se um dia
 * renderizar, a linha é marcada "(pré-carregamento)" em vez de omitida (o cabeçalho vem do cliente e não é confiável).
 */
export async function auditLeitura(usuarioId: string, entidade: string, entidadeId: string | number, detalhes?: string) {
  let preCarga = false;
  try {
    const { headers } = await import("next/headers");
    preCarga = (await headers()).has("next-router-prefetch");
  } catch {
    // fora de uma requisição (testes, scripts): sem cabeçalhos
  }
  await audit(usuarioId, "visualizar", entidade, entidadeId, [detalhes, preCarga ? "(pré-carregamento)" : null].filter(Boolean).join(" ") || undefined);
}

/** Códigos do Postgres de disputa por trava: deadlock, falha de serialização, trava indisponível, consulta cancelada por tempo. */
const PG_OCUPADO = new Set(["40P01", "40001", "55P03", "57014"]);

/**
 * Índice único com mensagem própria (o P2002 do adapter-pg traz o nome em meta.driverAdapterError.cause.constraint.index).
 * Serve para a corrida que a checagem do serviço não pega: os dois passam na checagem e o banco recusa o segundo.
 */
const MENSAGEM_DO_INDICE: Record<string, string> = {
  PedidoVenda_numeroNf_ativo_key: "Esta NF já está registrada em outro pedido. Confira o número da nota e atualize a página.",
};

/**
 * Erro de carga/disputa, que some ao repetir: P2028 (transação esperou demais ou passou do tempo), P2034 (conflito de
 * escrita ou deadlock), P2024/P2037 (conexões), pool do pg sem conexão livre ("timeout exceeded when trying to connect").
 * Em $queryRaw/$executeRaw o adapter-pg entrega deadlock como P2010 com o código original em
 * meta.driverAdapterError.cause.originalCode (conferido com um deadlock real no Prisma 7.10).
 */
function sistemaOcupado(e: unknown, code: string | undefined) {
  if (code === "P2028" || code === "P2034" || code === "P2024" || code === "P2037") return true;
  const causa = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; kind?: string } } } } | null)?.meta?.driverAdapterError?.cause;
  if (causa && ((causa.originalCode && PG_OCUPADO.has(causa.originalCode)) || causa.kind === "TransactionWriteConflict")) return true;
  return e instanceof Error && e.message.includes("timeout exceeded when trying to connect");
}

/**
 * Mensagem segura para o usuário. Só erros de negócio (`ErroNegocio` e subclasses) mostram o texto
 * original; os demais (banco, sistema, bugs) vão para o log do servidor com um código de referência,
 * para não expor estrutura interna (consultas, tabelas, caminhos).
 */
export function errorMessage(e: unknown) {
  if (e instanceof ErroNegocio) return e.message;
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2002" || (e instanceof Error && e.message.includes("Unique constraint"))) {
    const indice = (e as { meta?: { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } } | null)?.meta?.driverAdapterError?.cause?.constraint?.index;
    return (indice && MENSAGEM_DO_INDICE[indice]) || "Já existe um registro com esses dados.";
  }
  // duplo clique / outra aba: o registro já foi removido ou alterado
  if (code === "P2025") return "Registro não encontrado: ele pode ter sido removido ou alterado por outra pessoa (ou por um clique repetido). Atualize a página e confira.";
  if (code === "P2003") return "Um registro ligado a este (produto, fabricante, tabela etc.) não existe mais ou ainda está em uso. Atualize a página e confira.";
  if (sistemaOcupado(e, code)) {
    console.warn("[sistema ocupado]", code, resumoErroParaLog(e));
    return "O sistema está ocupado; tente de novo em instantes.";
  }
  const ref = randomUUID().slice(0, 8);
  console.error(`[erro inesperado ${ref}] ${resumoErroParaLog(e)}`); // nunca o objeto inteiro: o erro do Prisma carrega os dados da consulta
  return `Erro inesperado. Tente novamente ou informe o código ${ref} ao suporte.`;
}
