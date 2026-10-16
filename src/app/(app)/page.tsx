import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { ConteudoPainel } from "./_painel/painel";

/** Painel: só leitura e navegação (composição em _painel/). */
export default async function Painel() {
  const user = await requireUser();
  // protótipo do visual clássico: cookie gravado em Aparência (SeletorVisual, components/topbar-menus.tsx)
  const classico = (await cookies()).get("opme_visual")?.value === "classico";
  return <ConteudoPainel nome={user.nome} perfil={user.perfil} classico={classico} />;
}
