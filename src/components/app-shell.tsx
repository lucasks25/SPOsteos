"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BuscaGlobal } from "@/components/busca-global";
import { BotaoTema, MenuAjuda, Sino, botaoIcone, useAtalhosGlobais, type MenuId, type PosicaoMenu } from "@/components/topbar-menus";
import { BarraLateral, NavLateral, UsuarioLateral, type Modulo } from "@/components/menu-lateral";
import { MenuTopo } from "@/components/menu-topo";
import { esconderAbas, type NavGroup } from "@/components/nav";
import { definirPosicaoMenu } from "@/lib/tema-actions";

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
  // tela que é aba de outro item (fora do menu): destaca o item pai
  const noMenu = new Set(esconderAbas(groups).flatMap((g) => g.items.map((i) => i.href)));
  if (melhor && !noMenu.has(melhor.href)) {
    const pai = groups.flatMap((g) => g.items).find((i) => i.href === melhor!.href)?.abaDe;
    if (pai) melhor = { href: pai, modulo: melhor.modulo };
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

const COOKIE_MENU = "opme_menu";

/**
 * true a partir de 1024 px; null no servidor e na hidratação (aí as duas barras são renderizadas e o CSS escolhe, sem piscar).
 * Depois de hidratar, só a barra da largura atual fica montada: evita duas buscas globais e dois sinos consultando pendências.
 */
const LG = "(min-width: 1024px)";
function useDesktop(): boolean | null {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(LG);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(LG).matches,
    () => null,
  );
}

/**
 * Casca do app (docs/DESIGN-SYSTEM.md, seção 6). Duas posições de menu, escolhidas pelo usuário em "Aparência":
 * - "esquerda" (padrão): menu lateral escuro com os setores (recolhível no desktop, gaveta no celular) e barra superior
 *   branca fina com busca global (Ctrl K), ajuda, pendências e tema;
 * - "topo" (estilo Bling): uma barra só, com os módulos na horizontal e menus suspensos (menu-topo.tsx); no celular, a mesma gaveta.
 * O modo inicial vem do cookie `opme_menu_pos` lido no servidor (sem piscar); a troca é na hora, e a Server Action só persiste.
 */
export function AppShell({ groups, nome, perfil, sair, marca, marcaClara, recolhidaInicial = false, posicaoInicial = "esquerda", children }: {
  groups: NavGroup[];
  nome: string;
  perfil: string;
  sair: () => Promise<void>;
  /** marca sobre fundo escuro (menu lateral e gaveta) */
  marca?: ReactNode;
  /** marca sobre fundo claro (barra do topo) */
  marcaClara?: ReactNode;
  recolhidaInicial?: boolean;
  posicaoInicial?: PosicaoMenu;
  children: ReactNode;
}) {
  const pathname = usePathname();
  useAlinharColunas();
  const modulos = useMemo(() => agrupar(esconderAbas(groups)), [groups]);
  const ativo = itemAtivo(groups, pathname);
  const router = useRouter();
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const [gaveta, setGaveta] = useState(false);
  const [posicao, setPosicao] = useState<PosicaoMenu>(posicaoInicial);
  const topo = posicao === "topo";
  const desktop = useDesktop();
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

  const mudarPosicao = useCallback((p: PosicaoMenu) => {
    setPosicao(p);
    setMenu(null);
    startTransition(() => definirPosicaoMenu(p));
  }, []);

  return (
    <div data-menu={posicao} className={`min-h-screen ${topo ? "" : "lg:flex"}`}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg">
        Pular para o conteúdo
      </a>

      {/* no modo topo o menu lateral existe só como gaveta do celular (some a partir de 1024 px) */}
      <BarraLateral marca={marca} recolhida={recolhida && !topo} gaveta={gaveta} fecharGaveta={fecharGaveta} alternarRecolhida={alternarRecolhida} soCelular={topo}>
        <NavLateral modulos={modulos} ativo={ativo} recolhida={recolhida && !topo} aoNavegar={fecharGaveta} />
        <UsuarioLateral nome={nome} perfil={perfil} sair={sair} recolhida={recolhida && !topo} posicao={posicao} mudarPosicao={mudarPosicao} />
      </BarraLateral>

      <div className="flex min-w-0 flex-1 flex-col">
        {topo && desktop !== false && (
          <MenuTopo
            modulos={modulos}
            ativo={ativo}
            groups={groups}
            marca={marcaClara}
            nome={nome}
            perfil={perfil}
            sair={sair}
            posicao={posicao}
            mudarPosicao={mudarPosicao}
            menu={menu}
            alternar={alternar}
          />
        )}
        {/* barra do modo lateral; no modo topo é a barra do celular (abaixo de 1024 px) */}
        {(!topo || desktop !== true) && (
          <header className={`casca-barra sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md print:hidden ${topo ? "lg:hidden" : ""}`}>
            <div className="flex h-16 items-center gap-2 px-4 md:px-7">
              <button type="button" onClick={() => setGaveta(true)} aria-label="Abrir menu" aria-controls="menu-lateral" aria-expanded={gaveta} className={`${botaoIcone} -ml-2 lg:hidden`}>
                <Icon name="menu" size={20} />
              </button>
              {/* abaixo de 1024 px o menu lateral some: o isotipo da marca fica ao lado do botão de menu */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/isotipo.png" alt="SP OSTEOS" className="h-7 w-auto shrink-0 lg:hidden" />
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
        )}

        <main id="conteudo" className="conteudo w-full flex-1 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
