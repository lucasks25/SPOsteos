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
  // preferências de interface: menu lateral recolhido (cookie gravado pelo próprio menu) e posição do menu
  // (lateral ou topo; gravada por definirPosicaoMenu em src/lib/tema-actions.ts). Lidas aqui para não piscar ao carregar.
  const jar = await cookies();
  const recolhida = jar.get("opme_menu")?.value === "recolhido";
  const posicao = jar.get("opme_menu_pos")?.value === "topo" ? "topo" : "esquerda";
  return (
    <AppShell
      groups={groups}
      nome={user.nome}
      perfil={user.perfil.toLowerCase()}
      sair={logout}
      marca={<Marca variante="topo" sobreEscuro />}
      marcaClara={<Marca variante="topo" />}
      recolhidaInicial={recolhida}
      posicaoInicial={posicao}
    >
      {children}
    </AppShell>
  );
}
