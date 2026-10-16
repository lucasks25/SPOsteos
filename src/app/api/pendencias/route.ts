import { NextResponse } from "next/server";
import { exigirUsuarioRota } from "@/lib/auth";
import { limitarRota } from "@/lib/limite-rota";
import { carregarPendencias, listarPendencias } from "@/app/(app)/_painel/pendencias";

export const dynamic = "force-dynamic";

/** Pendências do perfil logado (sino da barra superior). */
export async function GET() {
  const user = await exigirUsuarioRota();
  if (user instanceof Response) return user;
  const excesso = limitarRota("pendencias", user.id);
  if (excesso) return excesso;
  const itens = listarPendencias(await carregarPendencias(user.perfil));
  return NextResponse.json(
    { total: itens.length, itens: itens.map(({ key, href, tom, titulo, nota, icon }) => ({ key, href, tom, titulo, nota, icon })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
