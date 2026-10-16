import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

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
/** Ano 0001 ou 9999 digitado por engano vira vencimento/validade absurdos (e quebra relatórios). */
const dataPlausivel = (d: Date) => d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2100;

/** Helpers zod para campos de formulário */
export const zf = {
  text: (msg = "Obrigatório") => z.string({ error: msg }).min(1, msg).max(TEXTO_MAX, "Texto muito longo (máximo 5.000 caracteres)"),
  /** campo opcional: vazio vira null (limpa o valor ao editar) */
  optText: () => z.string().max(TEXTO_MAX, "Texto muito longo (máximo 5.000 caracteres)").optional().transform((v) => v ?? null),
  int: (min = 0, max = QTD_MAX) => z.coerce.number({ error: "Número inválido" }).int("Deve ser inteiro").min(min, `Mínimo ${min}`).max(max, `Máximo ${max.toLocaleString("pt-BR")}`),
  money: () => z.coerce.number({ error: "Valor inválido" }).min(0, "Não pode ser negativo").max(VALOR_MAX, "Valor acima do limite do sistema"),
  date: (msg = "Data obrigatória") => z.coerce.date({ error: msg }).refine(dataPlausivel, "Data fora do intervalo aceito (1900 a 2100)"),
  optDate: () => z.coerce.date({ error: "Data inválida" }).refine(dataPlausivel, "Data fora do intervalo aceito (1900 a 2100)").optional().transform((v) => v ?? null),
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
    console.error("Falha ao registrar auditoria", e);
  }
}

/**
 * Mensagem segura para o usuário. Só erros de negócio (`ErroNegocio` e subclasses) mostram o texto
 * original; os demais (banco, sistema, bugs) vão para o log do servidor com um código de referência,
 * para não expor estrutura interna (consultas, tabelas, caminhos).
 */
export function errorMessage(e: unknown) {
  if (e instanceof ErroNegocio) return e.message;
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2002" || (e instanceof Error && e.message.includes("Unique constraint"))) return "Já existe um registro com esses dados.";
  // duplo clique / outra aba: o registro já foi removido ou alterado
  if (code === "P2025") return "Registro não encontrado: ele pode ter sido removido ou alterado por outra pessoa (ou por um clique repetido). Atualize a página e confira.";
  if (code === "P2003") return "Um registro ligado a este (produto, fabricante, tabela etc.) não existe mais ou ainda está em uso. Atualize a página e confira.";
  const ref = randomUUID().slice(0, 8);
  console.error(`[erro inesperado ${ref}]`, e);
  return `Erro inesperado. Tente novamente ou informe o código ${ref} ao suporte.`;
}
