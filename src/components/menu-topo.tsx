"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent, type ReactNode } from "react";
import { Icon, ICONE_ITEM } from "@/components/icons";
import { BuscaGlobal } from "@/components/busca-global";
import { ICONE_MODULO, useFecharFora, type Modulo } from "@/components/menu-lateral";
import { BotaoTema, MenuAjuda, PainelUsuario, Sino, iniciais, type MenuId, type PosicaoMenu } from "@/components/topbar-menus";
import type { NavGroup } from "@/components/nav";

type Ativo = { href: string; modulo: string } | null;

const MAIS = "__mais";
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Fecha quando a rota muda (padrão do React para "ajustar estado quando uma prop muda", sem efeito). */
function useFecharAoNavegar(fechar: () => void) {
  const pathname = usePathname();
  const [rota, setRota] = useState(pathname);
  if (rota !== pathname) {
    setRota(pathname);
    fechar();
  }
}

/**
 * Item da faixa de módulos (azul-marinho do menu, nos dois temas): ícone de 16 px + rótulo de 14 px, 16 px de recuo.
 * Ativo: véu claro e sublinhado de 2 px no destaque do menu (o mesmo da barra do item ativo no menu lateral).
 */
const classeModulo = (ativo: boolean, aberto: boolean) =>
  `relative flex h-full items-center gap-2 whitespace-nowrap px-4 text-sm font-medium transition-colors focus-visible:outline-offset-[-3px] focus-visible:outline-sidebar-destaque ${
    ativo
      ? "bg-[rgb(255_255_255/0.08)] text-sidebar-fg-ativo after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-sidebar-destaque"
      : "text-sidebar-fg hover:text-sidebar-fg-ativo"
  } ${aberto ? "bg-[rgb(255_255_255/0.12)] text-sidebar-fg-ativo" : "hover:bg-[rgb(255_255_255/0.06)]"}`;

function ConteudoItem({ m }: { m: Modulo }) {
  return (
    <>
      <Icon name={ICONE_MODULO[m.nome] ?? ICONE_ITEM[m.href] ?? "caixa"} size={16} className="shrink-0 opacity-80" />
      {m.nome}
    </>
  );
}

/** Painel suspenso abaixo da faixa: lista simples com um grupo; mega-menu em colunas (uma por grupo) com mais de um. */
function PainelModulo({ m, id, ativoHref, fechar }: { m: Modulo; id: string; ativoHref?: string; fechar: () => void }) {
  const mega = m.grupos.length > 1;
  const titulo = (g: NavGroup) => (g.label === m.nome ? "Geral" : g.label);
  const itens = (g: NavGroup, col: number) => (
    <ul aria-label={mega ? titulo(g) : undefined}>
      {g.items.map((i) => {
        const on = ativoHref === i.href;
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              data-item
              data-col={col}
              onClick={fechar}
              aria-current={on ? "page" : undefined}
              className={`flex h-8 items-center rounded-md px-2.5 text-sm focus-visible:outline-offset-[-2px] ${on ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              <span className="truncate">{i.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div id={id} data-painel role="region" aria-label={m.nome === MAIS ? "Mais módulos" : m.nome} className="absolute left-0 top-full z-50 overflow-hidden rounded-b-lg border border-t-0 border-slate-200 bg-white shadow-xl">
      {mega ? (
        <div className="flex divide-x divide-slate-200">
          {m.grupos.map((g, c) => (
            <div key={g.label} className="w-max min-w-44 max-w-64 p-2">
              <div aria-hidden="true" className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{titulo(g)}</div>
              {itens(g, c)}
            </div>
          ))}
        </div>
      ) : (
        <div className="w-56 p-2">{itens(m.grupos[0], 0)}</div>
      )}
    </div>
  );
}

/** "Mais": os módulos que não couberam viram colunas de um mega-menu (módulo · grupo). */
function moduloMais(sobra: Modulo[]): Modulo {
  const grupos = sobra.flatMap((s) =>
    s.grupos.map((g) => ({ ...g, label: s.grupos.length === 1 ? s.nome : `${s.nome} · ${g.label === s.nome ? "Geral" : g.label}` })),
  );
  return { nome: MAIS, grupos, href: sobra[0]?.href ?? "/" };
}

/**
 * Faixa de módulos (padrão "disclosure navigation" do WAI-ARIA APG: botões com aria-expanded que abrem listas de links).
 * Mouse: abre ao passar (atraso curto) ou ao clicar. Teclado: Enter/Espaço abre e fecha, seta para baixo entra no painel,
 * setas esquerda/direita andam entre módulos (ou entre colunas do mega-menu), Home/End, Esc fecha e devolve o foco.
 * Fecha ao clicar fora, ao sair com Tab, ao redimensionar e ao navegar. O que não cabe na largura vai para "Mais".
 */
function ModulosTopo({ modulos, ativo }: { modulos: Modulo[]; ativo: Ativo }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [cabem, setCabem] = useState(modulos.length);
  useFecharAoNavegar(() => setAberto(null));
  const nav = useRef<HTMLElement>(null);
  const raiz = useRef<HTMLUListElement>(null);
  const medidas = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abertoEm = useRef(0);
  const focarAoAbrir = useRef<"primeiro" | "ultimo" | null>(null);

  const visiveis = cabem >= modulos.length ? modulos : modulos.slice(0, cabem);
  const sobra = cabem >= modulos.length ? [] : modulos.slice(cabem);
  const mais = sobra.length ? moduloMais(sobra) : null;

  // quantos módulos cabem: mede uma cópia invisível de todos os itens (+ "Mais") contra a largura disponível
  useLayoutEffect(() => {
    const el = nav.current;
    const med = medidas.current;
    if (!el || !med) return;
    const calcular = () => {
      const larguras = Array.from(med.children).map((c) => (c as HTMLElement).offsetWidth);
      const lMais = larguras.pop() ?? 0;
      const gap = 4;
      const disp = el.clientWidth + 16; // a lista recua 16 px à esquerda para o texto alinhar com a logo
      const total = larguras.reduce((s, l) => s + l + gap, 0) - gap;
      if (total <= disp) return setCabem(larguras.length);
      let soma = 0;
      let n = 0;
      while (n < larguras.length && soma + larguras[n] + gap + lMais <= disp) soma += larguras[n++] + gap;
      setCabem(n);
    };
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    document.fonts?.ready.then(calcular).catch(() => {});
    return () => ro.disconnect();
  }, [modulos]);

  const botao = (nome: string) => raiz.current?.querySelector<HTMLElement>(`[data-modulo="${CSS.escape(nome)}"]`);
  const focarNoPainel = (onde: "primeiro" | "ultimo") => {
    const itens = raiz.current?.querySelectorAll<HTMLElement>("[data-painel] [data-item]");
    if (itens?.length) itens[onde === "primeiro" ? 0 : itens.length - 1].focus();
  };

  useEffect(() => {
    const t = timer;
    return () => clearTimeout(t.current);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const b = botao(aberto);
      setAberto(null);
      b?.focus();
    };
    const fechar = () => setAberto(null);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  // antes de pintar: alinha o painel ao módulo, sem passar da borda direita do conteúdo; se veio do teclado, foca o item
  useLayoutEffect(() => {
    if (!aberto) return;
    const painel = raiz.current?.querySelector<HTMLElement>("[data-painel]");
    const li = painel?.parentElement;
    const faixa = painel?.offsetParent as HTMLElement | null;
    if (!painel || !li || !faixa) return;
    const max = Math.max(0, faixa.clientWidth - parseFloat(getComputedStyle(faixa).paddingRight) - painel.offsetWidth);
    painel.style.left = `${Math.min(Math.max(li.offsetLeft, 0), max)}px`;
    if (focarAoAbrir.current) {
      focarNoPainel(focarAoAbrir.current);
      focarAoAbrir.current = null;
    }
  }, [aberto]);

  const entrar = (nome: string) => {
    clearTimeout(timer.current);
    if (aberto === nome) return;
    timer.current = setTimeout(() => {
      abertoEm.current = performance.now();
      setAberto(nome);
    }, aberto ? 60 : 140);
  };
  const sair = (nome: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAberto((a) => (a === nome ? null : a)), 220);
  };
  const clicar = (nome: string, quando: number) => {
    clearTimeout(timer.current);
    // aberto pelo mouse agora há pouco: o clique que veio junto não fecha (quando = event.timeStamp, base de performance.now)
    if (aberto === nome) {
      if (quando - abertoEm.current > 400) setAberto(null);
      return;
    }
    abertoEm.current = 0;
    setAberto(nome);
  };

  const teclas = (e: ReactKeyEvent<HTMLUListElement>) => {
    const alvo = e.target as HTMLElement;
    const topo = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-topo]") ?? []);
    const n = topo.length;
    const irPara = (el: HTMLElement | undefined) => {
      if (!el) return;
      el.focus();
      if (aberto) setAberto(el.dataset.modulo ?? null);
    };
    const iTopo = topo.indexOf(alvo);
    if (iTopo >= 0) {
      const nome = alvo.dataset.modulo;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        irPara(topo[(iTopo + (e.key === "ArrowRight" ? 1 : -1) + n) % n]);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        irPara(topo[e.key === "Home" ? 0 : n - 1]);
      } else if (nome && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const onde = e.key === "ArrowDown" ? "primeiro" : "ultimo";
        if (aberto === nome) focarNoPainel(onde);
        else {
          focarAoAbrir.current = onde;
          abertoEm.current = 0;
          setAberto(nome);
        }
      }
      return;
    }
    const painel = alvo.closest<HTMLElement>("[data-painel]");
    if (!painel || !aberto) return;
    const itens = Array.from(painel.querySelectorAll<HTMLElement>("[data-item]"));
    const i = itens.indexOf(alvo);
    if (i < 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      itens[e.key === "Home" ? 0 : itens.length - 1].focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const passo = e.key === "ArrowRight" ? 1 : -1;
      const destino = itens.find((x) => Number(x.dataset.col) === Number(alvo.dataset.col) + passo);
      if (destino) destino.focus();
      else {
        // sem coluna vizinha: passa ao módulo ao lado, já aberto
        const b = botao(aberto);
        const j = b ? topo.indexOf(b) : -1;
        if (j >= 0) irPara(topo[(j + passo + n) % n]);
      }
    }
  };

  return (
    <nav ref={nav} aria-label="Menu principal" className="h-full min-w-0">
      {/* lista estática (sem position): o painel se posiciona pela faixa e não é cortado pelo overflow da lista */}
      <ul ref={raiz} onKeyDown={teclas} className="-ml-4 flex h-full gap-1 overflow-hidden">
        {[...visiveis, ...(mais ? [mais] : [])].map((m) => {
          const ehMais = m.nome === MAIS;
          const doModulo = ehMais ? sobra.some((s) => s.nome === ativo?.modulo) : ativo?.modulo === m.nome;
          if (!ehMais && m.grupos.reduce((s, g) => s + g.items.length, 0) === 1) {
            return (
              <li key={m.nome} className="h-full">
                <Link href={m.href} data-topo data-on={doModulo || undefined} aria-current={ativo?.href === m.href ? "page" : undefined} className={classeModulo(doModulo, false)}>
                  <ConteudoItem m={m} />
                </Link>
              </li>
            );
          }
          const id = `menu-topo-${slug(m.nome)}`;
          const estaAberto = aberto === m.nome;
          return (
            <li
              key={m.nome}
              className="h-full"
              onMouseEnter={() => entrar(m.nome)}
              onMouseLeave={() => sair(m.nome)}
              onBlur={(e) => {
                // saiu com Tab para fora do módulo (clique em área vazia do painel tem relatedTarget nulo e não fecha)
                if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setAberto((a) => (a === m.nome ? null : a));
              }}
            >
              <button type="button" data-topo data-on={doModulo || undefined} data-modulo={m.nome} aria-expanded={estaAberto} aria-controls={id} onClick={(e) => clicar(m.nome, e.timeStamp)} className={classeModulo(doModulo, estaAberto)}>
                {ehMais ? (
                  <>
                    Mais
                    <Icon name="seta" size={14} className="opacity-70" />
                  </>
                ) : (
                  <ConteudoItem m={m} />
                )}
              </button>
              {estaAberto && <PainelModulo m={m} id={id} ativoHref={ativo?.href} fechar={() => setAberto(null)} />}
            </li>
          );
        })}
      </ul>
      <ul ref={medidas} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-max overflow-hidden">
        {modulos.map((m) => (
          <li key={m.nome}>
            <span className={classeModulo(false, false)}>
              <ConteudoItem m={m} />
            </span>
          </li>
        ))}
        <li>
          <span className={classeModulo(false, false)}>
            Mais
            <Icon name="seta" size={14} />
          </span>
        </li>
      </ul>
    </nav>
  );
}

/** Lupa da faixa superior: abre a mesma busca global (telas e dados) num painel; Ctrl K abre e foca. */
function BuscaTopo({ groups }: { groups: NavGroup[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFecharFora(aberto, () => setAberto(false), ref);
  useFecharAoNavegar(() => setAberto(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // abaixo de 1024 px quem atende é a busca da barra do celular
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && window.matchMedia("(min-width: 1024px)").matches) {
        e.preventDefault();
        setAberto(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (aberto) ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [aberto]);

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        setAberto(false);
        ref.current?.querySelector<HTMLButtonElement>("[data-gatilho]")?.focus();
      }}
    >
      <button
        type="button"
        data-gatilho
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label="Buscar telas e dados (Ctrl K)"
        title="Buscar (Ctrl K)"
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-expanded:bg-slate-100 aria-expanded:text-slate-900"
      >
        <Icon name="busca" size={19} />
      </button>
      {aberto && (
        <div role="dialog" aria-label="Buscar" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[30rem] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-xl [&_input]:rounded-md">
          <BuscaGlobal groups={groups} />
        </div>
      )}
    </div>
  );
}

/** Avatar com nome e perfil na faixa superior: o mesmo painel do rodapé do menu lateral (aparência, senha, sair). */
function AvatarTopo({ nome, perfil, sair, posicao, mudarPosicao }: { nome: string; perfil: string; sair: () => Promise<void>; posicao: PosicaoMenu; mudarPosicao: (p: PosicaoMenu) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFecharFora(aberto, () => setAberto(false), ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Menu do usuário ${nome}`}
        className="flex h-10 items-center gap-2 rounded-md pl-1 pr-2 text-left transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{iniciais(nome)}</span>
        <span className="min-w-0 leading-4">
          <span className="block max-w-40 truncate text-xs font-semibold text-slate-900">{nome}</span>
          <span className="block text-xs capitalize text-slate-500">{perfil}</span>
        </span>
        <Icon name="seta" size={14} className="shrink-0 text-slate-500" />
      </button>
      {aberto && (
        <div role="dialog" aria-label="Menu do usuário" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <PainelUsuario nome={nome} perfil={perfil} sair={sair} posicao={posicao} mudarPosicao={mudarPosicao} fechar={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Menu no topo (estilo Bling), só a partir de 1024 px; abaixo disso o AppShell mostra a barra do celular e a gaveta.
 * Faixa 1 (56 px, branca): logo à esquerda; à direita lupa (Ctrl K), tema, ajuda, pendências e avatar com nome e perfil.
 * Faixa 2 (44 px, azul-marinho do menu): módulos na horizontal com menu suspenso / mega-menu; o que não cabe vai para "Mais".
 * As duas faixas usam o mesmo recuo e a mesma largura máxima do conteúdo (.conteudo), para logo, módulos e título alinharem.
 */
export function MenuTopo({ modulos, ativo, groups, marca, nome, perfil, sair, posicao, mudarPosicao, menu, alternar }: {
  modulos: Modulo[];
  ativo: Ativo;
  groups: NavGroup[];
  marca?: ReactNode;
  nome: string;
  perfil: string;
  sair: () => Promise<void>;
  posicao: PosicaoMenu;
  mudarPosicao: (p: PosicaoMenu) => void;
  menu: MenuId | null;
  alternar: (id: MenuId) => (a: boolean) => void;
}) {
  const recuo = "mx-auto max-w-[1680px] px-6 min-[1440px]:px-8";
  return (
    <header className="topo-casca sticky top-0 z-30 hidden lg:block print:hidden">
      <div className="topo-faixa1 border-b border-slate-200 bg-white">
        <div className={`${recuo} flex h-14 items-center gap-4`}>
          <Link href="/" aria-label="Início" className="shrink-0 rounded-md [&_img]:h-9">
            {marca}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <BuscaTopo groups={groups} />
            {/* os botões de tema, ajuda e sino vêm de topbar-menus (40 px redondos no modo lateral); aqui, 36 px e cantos de ERP */}
            <div className="flex items-center gap-2 [&>*>button]:h-9 [&>*>button]:w-9 [&>*>button]:rounded-md">
              <BotaoTema />
              <MenuAjuda aberto={menu === "ajuda"} setAberto={alternar("ajuda")} />
              <Sino aberto={menu === "sino"} setAberto={alternar("sino")} />
            </div>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
            <AvatarTopo nome={nome} perfil={perfil} sair={sair} posicao={posicao} mudarPosicao={mudarPosicao} />
          </div>
        </div>
      </div>
      <div className="topo-faixa2 bg-sidebar">
        <div className={`${recuo} relative h-11`}>
          <ModulosTopo modulos={modulos} ativo={ativo} />
        </div>
      </div>
    </header>
  );
}
