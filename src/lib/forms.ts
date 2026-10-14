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
  return { success: false, state: { error: "Verifique os campos destacados.", fieldErrors } };
}

/** Helpers zod para campos de formulário */
export const zf = {
  text: (msg = "Obrigatório") => z.string({ error: msg }).min(1, msg),
  /** campo opcional: vazio vira null (limpa o valor ao editar) */
  optText: () => z.string().optional().transform((v) => v ?? null),
  int: (min = 0) => z.coerce.number({ error: "Número inválido" }).int("Deve ser inteiro").min(min),
  money: () => z.coerce.number({ error: "Valor inválido" }).min(0),
  date: (msg = "Data obrigatória") => z.coerce.date({ error: msg }),
  optDate: () => z.coerce.date().optional().transform((v) => v ?? null),
  optMoney: () => z.coerce.number().min(0).optional().transform((v) => v ?? null),
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
  const ref = randomUUID().slice(0, 8);
  console.error(`[erro inesperado ${ref}]`, e);
  return `Erro inesperado. Tente novamente ou informe o código ${ref} ao suporte.`;
}
