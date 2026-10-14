import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { caminhoAnexo, MIME_POR_EXT } from "../../../../_lib/anexos";

/** Download autenticado de anexo da cirurgia (não depende de /public ser servido em produção). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; anexoId: string }> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO", "ESTOQUE"]);
  const { id, anexoId } = await ctx.params;
  const anexo = await db.anexo.findUnique({ where: { id: anexoId } });
  if (!anexo || anexo.cirurgiaId !== id) return new Response("Anexo não encontrado", { status: 404 });
  const arquivo = caminhoAnexo(anexo.cirurgiaId, anexo.url);
  if (!arquivo) return new Response("Anexo inválido", { status: 400 });
  let conteudo: Buffer;
  try {
    conteudo = await readFile(arquivo);
  } catch {
    return new Response("Arquivo não encontrado", { status: 404 });
  }
  const ext = arquivo.slice(arquivo.lastIndexOf(".") + 1);
  const nome = encodeURIComponent(anexo.nome);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": MIME_POR_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${nome}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
