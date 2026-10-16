import "server-only";
import path from "node:path";

import { ID_SEGURO, NOME_ARQUIVO_SEGURO } from "@/lib/upload-seguro";

export { ID_SEGURO, MIME_POR_EXT } from "@/lib/upload-seguro";

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
  if (!NOME_ARQUIVO_SEGURO.test(nome)) return null;
  return path.join(pastaUploads(cirurgiaId), nome);
}
