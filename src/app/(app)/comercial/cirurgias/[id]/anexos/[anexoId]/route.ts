import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { exigirUsuarioRota } from "@/lib/auth";
import { audit } from "@/lib/forms";
import { limitarRota } from "@/lib/limite-rota";
import { caminhoAnexo, MIME_POR_EXT } from "../../../../_lib/anexos";

/** Download autenticado de anexo da cirurgia (não depende de /public ser servido em produção). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; anexoId: string }> }) {
  const sessao = await exigirUsuarioRota(["COMERCIAL", "FINANCEIRO", "ESTOQUE"]);
  if (sessao instanceof Response) return sessao;
  const excesso = limitarRota("download", sessao.id);
  if (excesso) return excesso;
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
  // anexo de cirurgia pode ter dado de saúde do paciente (LGPD art. 11): toda leitura fica registrada
  await audit(sessao.id, "baixar anexo", "Cirurgia", anexo.cirurgiaId, `${anexo.nome} (${anexo.id})`);
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
