import "server-only";
import type { Perfil } from "@/generated/prisma/client";
import { errorMessage } from "@/lib/forms";

/** Perfis que podem alterar cada grupo de cadastros (ADMIN sempre pode). */
export const PERFIS_SUPRIMENTOS: Perfil[] = ["COMPRAS", "ESTOQUE", "QUALIDADE"];
export const PERFIS_COMERCIAL: Perfil[] = ["COMERCIAL"];
export const PERFIS_HOSPITAL: Perfil[] = ["COMERCIAL", "FINANCEIRO"];

/** Mensagem amigável para falhas de exclusão por registros relacionados (FK). */
export function deleteErrorMessage(e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  const msg = e instanceof Error ? e.message : "";
  if (code === "P2003" || code === "P2014" || /foreign key|violates RESTRICT|relation/i.test(msg)) {
    return "Não é possível excluir: existem registros vinculados. Inative o cadastro em vez de excluí-lo.";
  }
  return errorMessage(e);
}
