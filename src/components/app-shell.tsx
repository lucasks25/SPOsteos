"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BuscaGlobal } from "@/components/busca-global";
import { MenuAjuda, Sino, botaoIcone, useAtalhosGlobais, type MenuId } from "@/components/topbar-menus";
import { BarraLateral, NavLateral, UsuarioLateral, type Modulo } from "@/components/menu-lateral";
import type { NavGroup } from "@/components/nav";
import { definirTema } from "@/lib/tema-actions";

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

/** Botão de tema na barra superior: alterna claro/escuro a partir do tema em uso (o "Sistema" fica no menu do usuário). */
function BotaoTema() {
  return (
    <form action={definirTema}>
      <button
        name="tema"
        value="escuro"
        onClick={(e) => {
          const raiz = document.documentElement;
          const escuro = raiz.dataset.theme === "dark" || (!raiz.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
          e.currentTarget.value = escuro ? "claro" : "escuro";
        }}
        aria-label="Alternar tema claro ou escuro"
        title="Alternar tema"
        className={botaoIcone}
      >
        <Icon name="lua" size={19} className="tema-icone-lua" />
        <Icon name="sol" size={19} className="tema-icone-sol" />
      </button>
    </form>
  );
}

const COOKIE_MENU = "opme_menu";

/**
 * Casca do app (docs/DESIGN-SYSTEM.md, seção 6): menu lateral escuro com os setores (recolhível no desktop, gaveta no celular)
 * e barra superior branca fina com busca global (Ctrl K), ajuda, pendências e tema.
 */
export function AppShell({ groups, nome, perfil, sair, marca, recolhidaInicial = false, children }: {
  groups: NavGroup[];
  nome: string;
  perfil: string;
  sair: () => Promise<void>;
  marca?: ReactNode;
  recolhidaInicial?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  useAlinharColunas();
  const modulos = useMemo(() => agrupar(groups), [groups]);
  const ativo = itemAtivo(groups, pathname);
  const router = useRouter();
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const [gaveta, setGaveta] = useState(false);
  const alternar = useCallback((id: MenuId) => (a: boolean) => setMenu(a ? id : null), []);
  const fecharGaveta = useCallback(() => setGaveta(false), []);

  useAtalhosGlobais({
    abrir: (m) => setMenu(m),
    irPara: (letra) => {
      const alvo = { p: "Painel", c: "Comercial", e: "Estoque", f: "Financeiro" }[letra];
      const m = modulos.find((x) => x.nome === alvo);
      if (m) router.push(m.href);
    },
  });

  // gaveta do celular: Esc fecha
  useEffect(() => {
    if (!gaveta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setGaveta(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [gaveta]);

  const alternarRecolhida = () => {
    const nova = !recolhida;
    setRecolhida(nova);
    // preferência de interface (não sensível): o layout lê no servidor para não "piscar" ao carregar
    document.cookie = `${COOKIE_MENU}=${nova ? "recolhido" : "aberto"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg">
        Pular para o conteúdo
      </a>

      <BarraLateral marca={marca} recolhida={recolhida} gaveta={gaveta} fecharGaveta={fecharGaveta} alternarRecolhida={alternarRecolhida}>
        <NavLateral modulos={modulos} ativo={ativo} recolhida={recolhida} aoNavegar={fecharGaveta} />
        <UsuarioLateral nome={nome} perfil={perfil} sair={sair} recolhida={recolhida} />
      </BarraLateral>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md print:hidden">
          <div className="flex h-16 items-center gap-2 px-4 md:px-7">
            <button type="button" onClick={() => setGaveta(true)} aria-label="Abrir menu" aria-controls="menu-lateral" aria-expanded={gaveta} className={`${botaoIcone} -ml-2 lg:hidden`}>
              <Icon name="menu" size={20} />
            </button>
            <div className="flex min-w-0 flex-1">
              <BuscaGlobal groups={groups} />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <BotaoTema />
              <MenuAjuda aberto={menu === "ajuda"} setAberto={alternar("ajuda")} />
              <Sino aberto={menu === "sino"} setAberto={alternar("sino")} />
            </div>
          </div>
        </header>

        <main id="conteudo" className="conteudo w-full flex-1 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
