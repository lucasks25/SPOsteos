import "server-only";
import path from "node:path";

export const ID_SEGURO = /^[a-z0-9]+$/i;

/**
 * Pasta dos anexos da cirurgia. Fica FORA de `public/` de propósito: anexos podem ter dados de
 * paciente e só podem ser lidos pela rota autenticada `cirurgias/[id]/anexos/[anexoId]`.
 */
export function pastaUploads(cirurgiaId: string) {
  return path.join(process.cwd(), "storage", "uploads", "cirurgias", cirurgiaId);
}

/** Caminho absoluto do arquivo de um anexo, garantindo que fique dentro da pasta da cirurgia. */
export function caminhoAnexo(cirurgiaId: string, url: string): string | null {
  if (!ID_SEGURO.test(cirurgiaId)) return null;
  const nome = path.basename(url);
  if (!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(nome)) return null;
  return path.join(pastaUploads(cirurgiaId), nome);
}

export const MIME_POR_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };
