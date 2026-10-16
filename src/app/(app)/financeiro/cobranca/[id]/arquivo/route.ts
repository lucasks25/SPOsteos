import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/forms";
import { exigirUsuarioRota } from "@/lib/auth";
import { idInt } from "@/lib/ids";

/** Download do arquivo de remessa de cobrança (CNAB 400, linhas com CRLF). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await exigirUsuarioRota(["FINANCEIRO"]);
  if (user instanceof Response) return user;
  const id = idInt((await ctx.params).id);
  if (id === null) return new Response("Remessa inválida", { status: 400 });
  const rem = await db.remessaCobranca.findUnique({ where: { id }, select: { id: true, conteudo: true, canceladaEm: true } });
  if (!rem || !rem.conteudo) return new Response("Remessa não encontrada", { status: 404 });
  if (rem.canceladaEm) return new Response("Remessa cancelada: não envie este arquivo ao banco", { status: 409 });
  // quem baixou o arquivo que vai ao banco, e qual (hash): rastro para "o mesmo arquivo foi enviado duas vezes?"
  await audit(user.id, "baixar arquivo de cobrança", "RemessaCobranca", rem.id, `sha256 ${createHash("sha256").update(rem.conteudo).digest("hex")}`);
  return new Response(rem.conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="COBRANCA_${String(rem.id).padStart(5, "0")}.REM"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
