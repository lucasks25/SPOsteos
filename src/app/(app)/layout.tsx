import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const groups = NAV.filter((g) => user.perfil === "ADMIN" || !g.perfis || g.perfis.includes(user.perfil));
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 bg-teal-900 md:block print:hidden">
        <div className="sticky top-0 max-h-screen overflow-y-auto">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-lg font-semibold text-white">OPME</div>
            <div className="text-xs text-teal-200/80">Gestão de materiais especiais</div>
          </div>
          <Sidebar groups={groups} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 print:hidden">
          <details className="md:hidden">
            <summary className="cursor-pointer text-sm font-medium text-teal-800">Menu</summary>
            <div className="absolute left-0 z-20 mt-2 w-64 rounded-r-xl bg-teal-900 shadow-xl">
              <Sidebar groups={groups} />
            </div>
          </details>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.nome} <span className="text-xs text-slate-400">({user.perfil.toLowerCase()})</span>
            </span>
            <form action={logout}>
              <button className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">Sair</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
