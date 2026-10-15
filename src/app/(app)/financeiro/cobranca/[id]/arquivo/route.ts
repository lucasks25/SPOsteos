import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Download do arquivo de remessa de cobrança (CNAB 400, linhas com CRLF). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return new Response("Remessa inválida", { status: 400 });
  const rem = await db.remessaCobranca.findUnique({ where: { id: Number(id) }, select: { id: true, conteudo: true, canceladaEm: true } });
  if (!rem || !rem.conteudo) return new Response("Remessa não encontrada", { status: 404 });
  if (rem.canceladaEm) return new Response("Remessa cancelada: não envie este arquivo ao banco", { status: 409 });
  return new Response(rem.conteudo, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="COBRANCA_${String(rem.id).padStart(5, "0")}.REM"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
