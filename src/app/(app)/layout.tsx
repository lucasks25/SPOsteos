import type { ReactNode } from "react";
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
  return (
    <AppShell groups={groups} nome={user.nome} perfil={user.perfil.toLowerCase()} sair={logout} marca={<Marca variante="topo" />}>
      {children}
    </AppShell>
  );
}
