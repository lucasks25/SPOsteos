"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { NavGroup } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">O</span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-white">OPME</span>
        <span className="block text-[11px] text-teal-100/70">Gestão de materiais especiais</span>
      </span>
    </Link>
  );
}

/** Migalhas: Grupo › Tela, a partir do menu. */
function Migalhas({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  let achado: { grupo: string; item: string } | null = null;
  let melhor = -1;
  for (const g of groups) for (const i of g.items) if ((pathname === i.href || pathname.startsWith(i.href + "/")) && i.href.length > melhor) {
    melhor = i.href.length;
    achado = { grupo: g.label, item: i.label };
  }
  if (!achado || pathname === "/") return <span className="text-sm font-medium text-slate-700">Painel</span>;
  return (
    <nav aria-label="Você está em" className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-500">{achado.grupo}</span>
      <Icon name="direita" size={14} className="text-slate-300" />
      <span className="font-medium text-slate-800">{achado.item}</span>
    </nav>
  );
}

export function AppShell({ groups, nome, perfil, sair, children }: { groups: NavGroup[]; nome: string; perfil: string; sair: () => Promise<void>; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg">
        Pular para o conteúdo
      </a>

      <aside className="hidden w-60 shrink-0 bg-teal-900 md:block print:hidden">
        <div className="sticky top-0 flex max-h-screen flex-col">
          <div className="border-b border-white/10 px-4 py-3.5">
            <Marca />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Sidebar groups={groups} />
          </div>
        </div>
      </aside>

      {aberto && <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="fixed inset-0 z-30 bg-slate-900/50 md:hidden print:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-teal-900 shadow-xl transition-transform duration-200 md:hidden print:hidden ${aberto ? "translate-x-0" : "-translate-x-full"}`}
        aria-hidden={!aberto}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <Marca />
          <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="rounded-md p-1.5 text-teal-100 hover:bg-white/10">
            <Icon name="fechar" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar groups={groups} onNavigate={() => setAberto(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6 print:hidden">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Abrir menu" onClick={() => setAberto(true)} className="-ml-1 rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden">
              <Icon name="menu" size={20} />
            </button>
            <Migalhas groups={groups} />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800" aria-hidden="true">
                {iniciais}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-medium text-slate-800">{nome}</span>
                <span className="block text-[11px] capitalize text-slate-500">{perfil}</span>
              </span>
            </div>
            <form action={sair}>
              <button className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <Icon name="sair" size={16} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
