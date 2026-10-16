"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BuscaGlobal } from "@/components/busca-global";
import { MenuAjuda, Sino, useAtalhosGlobais, type MenuId } from "@/components/topbar-menus";
import type { NavGroup } from "@/components/nav";
import { definirTema } from "@/lib/tema-actions";

type Modulo = { nome: string; grupos: NavGroup[]; href: string };

function agrupar(groups: NavGroup[]): Modulo[] {
  const mapa = new Map<string, NavGroup[]>();
  for (const g of groups) {
    const m = g.modulo ?? g.label;
    mapa.set(m, [...(mapa.get(m) ?? []), g]);
  }
  return [...mapa].map(([nome, grupos]) => ({ nome, grupos, href: grupos[0].items[0].href }));
}

/** Item do menu que corresponde à rota atual (o href mais específico que é prefixo). */
function itemAtivo(groups: NavGroup[], pathname: string) {
  let melhor: { href: string; modulo: string } | null = null;
  for (const g of groups) for (const i of g.items) {
    const bate = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (bate && (!melhor || i.href.length > melhor.href.length)) melhor = { href: i.href, modulo: g.modulo ?? g.label };
  }
  return melhor;
}

function MenuUsuario({ nome, perfil, sair }: { nome: string; perfil: string; sair: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-haspopup="menu" aria-expanded={aberto} aria-label={`Menu do usuário ${nome}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary hover:bg-primary-hover">
        {iniciais}
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-lg bg-white shadow-[var(--shadow-overlay)]">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <div className="truncate text-sm font-bold text-slate-900">{nome}</div>
            <div className="text-xs capitalize text-slate-500">{perfil}</div>
          </div>
          <form action={definirTema} className="border-b border-slate-200 px-3 py-2.5">
            <div className="mb-1.5 text-xs font-semibold text-slate-600">Aparência</div>
            <div className="grid grid-cols-3 gap-1">
              {[["claro", "Claro"], ["escuro", "Escuro"], ["auto", "Sistema"]].map(([v, r]) => (
                <button key={v} name="tema" value={v} className="h-[1.625rem] rounded-lg border border-slate-300 bg-white text-xs font-semibold text-teal-700 hover:bg-slate-100">
                  {r}
                </button>
              ))}
            </div>
          </form>
          <form action={sair}>
            <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100">
              <Icon name="sair" size={15} />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Alinha à direita o título das colunas cujas células são numéricas (classe text-right), para valor e cabeçalho ficarem juntos.
 * Roda depois de cada navegação e quando o conteúdo muda.
 */
function useAlinharColunas() {
  const pathname = usePathname();
  useEffect(() => {
    const alinhar = () => {
      document.querySelectorAll<HTMLTableElement>("main table").forEach((t) => {
        const linhas = Array.from(t.tBodies[0]?.rows ?? []).slice(0, 4);
        if (linhas.length === 0) return;
        t.querySelectorAll<HTMLTableCellElement>("thead th").forEach((th, i) => {
          const direita = linhas.every((l) => l.cells.length > i && l.cells[i].classList.contains("text-right"));
          th.classList.toggle("text-right", direita);
          th.classList.toggle("text-left", !direita);
        });
      });
    };
    // espera a hidratação terminar: mexer nas classes antes disso gera aviso de divergência do React
    const inicial = setTimeout(alinhar, 250);
    const alvo = document.getElementById("conteudo");
    if (!alvo) return () => clearTimeout(inicial);
    let t: ReturnType<typeof setTimeout>;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(alinhar, 60);
    });
    obs.observe(alvo, { childList: true, subtree: true });
    return () => {
      clearTimeout(inicial);
      clearTimeout(t);
      obs.disconnect();
    };
  }, [pathname]);
}

/**
 * Barra superior no estilo Fiori Shell Bar (tema Horizonte, ver docs/DESIGN-SYSTEM.md): faixa 1 (2.75rem) marca, busca, ajuda,
 * pendências e avatar; faixa 2 abas de módulo; faixa 3 abas das telas do módulo (como a barra de abas do Fiori, só texto).
 */
export function AppShell({ groups, nome, perfil, sair, marca, children }: { groups: NavGroup[]; nome: string; perfil: string; sair: () => Promise<void>; marca?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  useAlinharColunas();
  const modulos = useMemo(() => agrupar(groups), [groups]);
  const ativo = itemAtivo(groups, pathname);
  const moduloAtivo = modulos.find((m) => m.nome === ativo?.modulo) ?? modulos[0];
  const router = useRouter();
  const [menu, setMenu] = useState<MenuId | null>(null);
  const alternar = useCallback((id: MenuId) => (a: boolean) => setMenu(a ? id : null), []);
  useAtalhosGlobais({
    abrir: (m) => setMenu(m),
    irPara: (letra) => {
      const nome = { p: "Painel", c: "Comercial", e: "Estoque", f: "Financeiro" }[letra];
      const m = modulos.find((x) => x.nome === nome);
      if (m) router.push(m.href);
    },
  });
  const temSubabas = moduloAtivo && moduloAtivo.grupos.reduce((n, g) => n + g.items.length, 0) > 1;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 bg-shell shadow-[var(--shadow-header)] print:hidden">
        <div className="flex h-11 items-center gap-3 border-b border-shell-border px-3 md:px-4">
          <Link href="/" aria-label="Início" className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-100">
            {marca ?? <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">O</span>}
          </Link>
          <div className="flex min-w-0 flex-1 justify-center md:justify-start md:pl-4">
            <BuscaGlobal groups={groups} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <MenuAjuda aberto={menu === "ajuda"} setAberto={alternar("ajuda")} />
            <Sino aberto={menu === "sino"} setAberto={alternar("sino")} />
          </div>
          <MenuUsuario nome={nome} perfil={perfil} sair={sair} />
        </div>

        <nav aria-label="Módulos" className="abas flex h-10 items-stretch overflow-x-auto px-3 md:px-4">
          {modulos.map((m) => {
            const on = m.nome === moduloAtivo?.nome;
            return (
              <Link
                key={m.nome}
                href={m.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex shrink-0 items-center px-3 text-sm transition-colors ${on ? "font-semibold text-teal-700" : "text-slate-700 hover:text-teal-700"}`}
              >
                {m.nome}
                {on && <span className="absolute inset-x-2 bottom-0 h-[0.1875rem] rounded-t-full bg-teal-700" />}
              </Link>
            );
          })}
        </nav>

        {temSubabas && moduloAtivo && (
          <nav aria-label={`Telas de ${moduloAtivo.nome}`} className="abas flex h-9 items-stretch overflow-x-auto border-t border-slate-200 bg-shell px-3 md:px-4">
            {moduloAtivo.grupos.map((g, gi) => (
              <div key={g.label} className={`flex shrink-0 items-stretch ${gi > 0 ? "ml-2 border-l border-slate-200 pl-2" : ""}`}>
                {moduloAtivo.grupos.length > 1 && <span className="flex items-center pr-1.5 text-xs text-slate-500">{g.label}</span>}
                {g.items.map((i) => {
                  const on = ativo?.href === i.href;
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={on ? "page" : undefined}
                      className={`relative flex shrink-0 items-center px-2.5 text-sm transition-colors ${on ? "font-semibold text-teal-700" : "text-slate-700 hover:text-teal-700"}`}
                    >
                      {i.label}
                      {on && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-t-full bg-teal-700" />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
      </header>

      <main id="conteudo" className="conteudo w-full flex-1 print:p-0">
        {children}
      </main>
    </div>
  );
}
