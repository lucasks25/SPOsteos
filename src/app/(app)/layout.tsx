import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/components/nav";
import { AppShell } from "@/components/app-shell";
import { Marca } from "@/components/marca";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const groups = NAV.filter((g) => user.perfil === "ADMIN" || !g.perfis || g.perfis.includes(user.perfil)).map((g) => ({
    ...g,
    items: g.items.filter((i) => user.perfil === "ADMIN" || !i.perfis || i.perfis.includes(user.perfil)),
  }));
  // preferência de interface: menu lateral recolhido (cookie gravado pelo próprio menu)
  const recolhida = (await cookies()).get("opme_menu")?.value === "recolhido";
  return (
    <AppShell groups={groups} nome={user.nome} perfil={user.perfil.toLowerCase()} sair={logout} marca={<Marca variante="topo" sobreEscuro />} recolhidaInicial={recolhida}>
      {children}
    </AppShell>
  );
}
