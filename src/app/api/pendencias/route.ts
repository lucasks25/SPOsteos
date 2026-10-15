import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { carregarPendencias, listarPendencias } from "@/lib/pendencias";

export const dynamic = "force-dynamic";

/** Pendências do perfil logado (sino da barra superior). */
export async function GET() {
  const user = await requireUser();
  const itens = listarPendencias(await carregarPendencias(user.perfil));
  return NextResponse.json(
    { total: itens.length, itens: itens.map(({ key, href, tom, titulo, nota, icon }) => ({ key, href, tom, titulo, nota, icon })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
