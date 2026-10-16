import { readFile } from "node:fs/promises";
import { exigirUsuarioRota } from "@/lib/auth";
import { MIME_POR_EXT } from "@/lib/upload-seguro";
import { PERFIS_VER_DOCUMENTOS } from "../../../../_lib/documentos";
import { arquivoParaDownload } from "../../../../_lib/documentos-servico";

/** Download autenticado de arquivo de documento: só entrega se o arquivo pertencer ao documento da URL. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; arquivoId: string }> }) {
  const sessao = await exigirUsuarioRota(PERFIS_VER_DOCUMENTOS);
  if (sessao instanceof Response) return sessao;
  const { id, arquivoId } = await ctx.params;
  const achado = await arquivoParaDownload(id, arquivoId);
  if (!achado) return new Response("Arquivo não encontrado", { status: 404 });
  let conteudo: Buffer;
  try {
    conteudo = await readFile(achado.abs);
  } catch {
    return new Response("Arquivo não encontrado", { status: 404 });
  }
  const ext = achado.abs.slice(achado.abs.lastIndexOf(".") + 1);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": MIME_POR_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(achado.arq.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
