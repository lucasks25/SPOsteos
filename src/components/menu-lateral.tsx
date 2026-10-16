"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, ICONE_ITEM, type IconName } from "@/components/icons";
import type { NavGroup } from "@/components/nav";
import { PainelUsuario, iniciais, type PosicaoMenu } from "@/components/topbar-menus";

export type Modulo = { nome: string; grupos: NavGroup[]; href: string };

/** Ícone de cada módulo (setor) no menu lateral e na faixa de módulos do modo topo. */
export const ICONE_MODULO: Record<string, IconName> = {
  Painel: "painel",
  Comercial: "atividade",
  Estoque: "pacote",
  Qualidade: "escudo",
  Compras: "carrinho",
  Financeiro: "banco",
  Faturamento: "documento",
  "Relatórios": "grafico",
  Cadastros: "livro",
  "Administração": "engrenagem",
};

/** Fecha um painel suspenso ao clicar fora ou com Esc. */
export function useFecharFora(aberto: boolean, fechar: () => void, raiz: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) fechar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, fechar, raiz]);
}

/*
 * Menu lateral claro (referência: Bling novo, Omie, Conta Azul): fundo de superfície (branco no claro, superfície escura
 * no escuro, pelos tokens slate/white), itens de 40 px com raio de 6 px; ativo em azul-claro com texto azul da marca e
 * barra de 3 px na borda esquerda. Subitens recuados sob o módulo com linha-guia vertical fina.
 */
const itemBase = "relative flex items-center rounded-md transition-colors";
const barraAtiva = "before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-teal-600";
const moduloOn = `bg-teal-50 font-semibold text-teal-700 [&_svg]:text-teal-700 ${barraAtiva}`;
const moduloOff = "text-slate-700 hover:bg-slate-100 hover:text-slate-900";
// recolhido (só no desktop): o módulo da tela atual ganha o destaque inteiro, já que os subitens não aparecem
const moduloOnRecolhido = "lg:bg-teal-50 lg:before:absolute lg:before:-left-3 lg:before:top-1.5 lg:before:bottom-1.5 lg:before:w-[3px] lg:before:rounded-r lg:before:bg-teal-600";

function ItensDoModulo({ m, ativoHref, aoNavegar, flutuante }: { m: Modulo; ativoHref?: string; aoNavegar: () => void; flutuante?: boolean }) {
  return (
    // sob o módulo: linha-guia na altura do centro do ícone (12 px de recuo + metade de 18 px); no painel flutuante, sem guia
    <div className={flutuante ? "" : "menu-arvore ml-[21px] border-l border-slate-200 pb-1"}>
      {m.grupos.map((g) => (
        <div key={g.label}>
          {m.grupos.length > 1 && g.label !== m.nome && <div className={`menu-grupo px-3 pb-1 pt-3 text-xs font-semibold text-slate-500 ${flutuante ? "" : "ml-1"}`}>{g.label}</div>}
          <ul>
            {g.items.map((i) => {
              const on = ativoHref === i.href;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={aoNavegar}
                    title={i.label.length > 24 ? i.label : undefined}
                    aria-current={on ? "page" : undefined}
                    className={`menu-sub ${itemBase} h-[34px] px-3 text-[13.5px] ${flutuante ? "" : "ml-1"} ${
                      on
                        ? `bg-teal-50 font-medium text-teal-700 ${flutuante ? "" : "before:absolute before:-left-[5px] before:top-1 before:bottom-1 before:w-0.5 before:bg-teal-600"}`
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Menu lateral: módulos (setores) em sanfona com ícone e rótulo; recolhido (só no desktop), mostra só os ícones e abre os
 * itens num painel claro ao lado. Na gaveta do celular a sanfona vale sempre, mesmo com a preferência "recolhido".
 */
export function NavLateral({ modulos, ativo, recolhida, aoNavegar }: { modulos: Modulo[]; ativo: { href: string; modulo: string } | null; recolhida: boolean; aoNavegar: () => void }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [flutuante, setFlutuante] = useState<string | null>(null);
  const [posFlutuante, setPosFlutuante] = useState({ top: 0, maxHeight: 400 });
  const raiz = useRef<HTMLElement>(null);
  useFecharFora(flutuante !== null, () => setFlutuante(null), raiz);

  return (
    <nav
      ref={raiz}
      aria-label="Menu principal"
      className={`menu-nav flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:var(--c-slate-300)_transparent] [scrollbar-width:thin] ${recolhida ? "lg:overflow-visible" : ""}`}
    >
      <ul className="space-y-0.5">
        {modulos.map((m) => {
          const itens = m.grupos.reduce((n, g) => n + g.items.length, 0);
          const doModulo = ativo?.modulo === m.nome;
          const icone = ICONE_MODULO[m.nome] ?? ICONE_ITEM[m.href] ?? "caixa";
          const rotulo = <span className="menu-rotulo truncate">{m.nome}</span>;
          const ico = <Icon name={icone} size={18} className="shrink-0 text-slate-500" />;

          if (itens === 1) {
            const on = ativo?.href === m.href;
            return (
              <li key={m.nome}>
                <Link href={m.href} onClick={aoNavegar} title={recolhida ? m.nome : undefined} aria-current={on ? "page" : undefined} className={`menu-mod ${itemBase} h-10 gap-3 px-3 text-sm font-medium ${on ? moduloOn : moduloOff}`}>
                  {ico}
                  {rotulo}
                </Link>
              </li>
            );
          }

          const aberto = abertos[m.nome] ?? doModulo;
          return (
            <li key={m.nome} className="relative">
              <button
                type="button"
                title={recolhida ? m.nome : undefined}
                aria-expanded={recolhida ? flutuante === m.nome : aberto}
                onClick={(e) => {
                  if (!recolhida || !window.matchMedia("(min-width: 1024px)").matches) return setAbertos((a) => ({ ...a, [m.nome]: !aberto }));
                  // painel ao lado do trilho: fixo na janela, alinhado ao botão e limitado à altura visível
                  const r = e.currentTarget.getBoundingClientRect();
                  const top = Math.max(8, Math.min(r.top, window.innerHeight - 320));
                  setPosFlutuante({ top, maxHeight: window.innerHeight - top - 8 });
                  setFlutuante((f) => (f === m.nome ? null : m.nome));
                }}
                data-on={doModulo || undefined}
                className={`menu-mod ${itemBase} h-10 w-full gap-3 px-3 text-sm font-medium ${
                  doModulo ? `text-teal-700 [&_svg]:text-teal-700 hover:bg-slate-100 ${recolhida ? moduloOnRecolhido : ""}` : moduloOff
                }`}
              >
                {ico}
                {rotulo}
                {/* visual clássico (estilos/classico.css): caixa +/− da árvore no lugar da seta */}
                <span className="menu-rotulo menu-caixa hidden" aria-hidden="true">{aberto ? "−" : "+"}</span>
                <Icon name="seta" size={15} className={`menu-rotulo menu-seta ml-auto shrink-0 text-slate-400! transition-transform ${aberto ? "rotate-180" : ""}`} />
              </button>
              {aberto && (
                <div className={recolhida ? "lg:hidden" : ""}>
                  <ItensDoModulo m={m} ativoHref={ativo?.href} aoNavegar={aoNavegar} />
                </div>
              )}
              {recolhida && flutuante === m.nome && (
                <div style={posFlutuante} className="fixed left-[5.25rem] z-50 hidden w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl lg:block">
                  <div className="px-3 pb-1 pt-1.5 text-sm font-semibold text-slate-900">{m.nome}</div>
                  <ItensDoModulo
                    m={m}
                    ativoHref={ativo?.href}
                    flutuante
                    aoNavegar={() => {
                      setFlutuante(null);
                      aoNavegar();
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Rodapé do menu lateral: avatar, nome e perfil; abre (para cima) aparência (tema e posição do menu), trocar senha e sair. */
export function UsuarioLateral({ nome, perfil, sair, recolhida, posicao, mudarPosicao }: {
  nome: string;
  perfil: string;
  sair: () => Promise<void>;
  recolhida: boolean;
  posicao: PosicaoMenu;
  mudarPosicao: (p: PosicaoMenu) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFecharFora(aberto, () => setAberto(false), ref);

  return (
    <div ref={ref} className="menu-usuario relative border-t border-slate-200 px-3 pb-1 pt-2">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Menu do usuário ${nome}`}
        title={recolhida ? nome : undefined}
        className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100 ${recolhida ? "lg:justify-center" : ""}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{iniciais(nome)}</span>
        <span className="menu-rotulo min-w-0 flex-1 leading-4">
          <span className="block truncate text-[13px] font-semibold text-slate-900">{nome}</span>
          <span className="block truncate text-xs capitalize text-slate-500">{perfil}</span>
        </span>
        <Icon name="seta" size={15} className="menu-rotulo shrink-0 rotate-180 text-slate-400" />
      </button>
      {aberto && (
        <div role="dialog" aria-label="Menu do usuário" className={`absolute z-50 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ${recolhida ? "bottom-2 left-full ml-3 max-lg:bottom-full max-lg:left-3 max-lg:ml-0 max-lg:mb-1" : "bottom-full left-3 mb-1"}`}>
          <PainelUsuario nome={nome} perfil={perfil} sair={sair} posicao={posicao} mudarPosicao={mudarPosicao} fechar={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Contêiner do menu lateral: 248 px, fixo e recolhível (72 px) no desktop; gaveta com fundo escurecido no celular.
 * Topo: logo colorida (claro) ou branca (escuro); recolhido, só o isotipo. O botão "Recolher" fica no rodapé, abaixo do usuário.
 * `soCelular` (menu no topo): só a gaveta existe; a partir de 1024 px o menu é a barra do topo (menu-topo.tsx).
 */
export function BarraLateral({ marca, recolhida, gaveta, fecharGaveta, alternarRecolhida, soCelular = false, children }: {
  marca: ReactNode;
  soCelular?: boolean;
  recolhida: boolean;
  gaveta: boolean;
  fecharGaveta: () => void;
  alternarRecolhida: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {gaveta && <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] lg:hidden print:hidden" onClick={fecharGaveta} aria-hidden="true" />}
      <aside
        id="menu-lateral"
        data-recolhida={recolhida}
        aria-label="Navegação"
        // 248 px aberto; recolhido, a largura de 4.5rem vem de componentes.css (só a partir de 1024 px)
        style={recolhida ? undefined : { width: 248 }}
        className={`barra-lateral fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white text-slate-700 shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none print:hidden ${soCelular ? "lg:hidden" : ""} ${gaveta ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="menu-cabeca flex h-16 shrink-0 items-center gap-2 px-5">
          <Link href="/" aria-label="Início" onClick={fecharGaveta} className="min-w-0 flex-1 overflow-hidden rounded-md py-1">
            <span className="marca-completa block [&_img]:h-9">{marca}</span>
            {/* menu recolhido: só o símbolo (colorido no claro, branco no escuro), a logo horizontal não cabe em 72 px */}
            <span className="marca-isotipo hidden text-center">
              <span className="marca-claro">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marca/isotipo.png" alt="" aria-hidden="true" className="mx-auto h-8 w-auto" />
              </span>
              <span className="marca-escuro">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marca/isotipo-branco.png" alt="" aria-hidden="true" className="mx-auto h-8 w-auto" />
              </span>
            </span>
          </Link>
          <button type="button" onClick={fecharGaveta} aria-label="Fechar menu" className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden">
            <Icon name="fechar" size={18} />
          </button>
        </div>
        {children}
        {!soCelular && (
          <div className="menu-recolher hidden px-3 pb-2 lg:block">
            <button
              type="button"
              onClick={alternarRecolhida}
              aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              title={recolhida ? "Expandir menu" : "Recolher menu"}
              className={`flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 ${recolhida ? "justify-center px-0" : ""}`}
            >
              <Icon name="direita" size={16} className={`shrink-0 ${recolhida ? "" : "rotate-180"}`} />
              <span className="menu-rotulo">Recolher</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
