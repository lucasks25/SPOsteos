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
  "Gestão": "grafico",
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

const itemBase = "relative flex items-center rounded-lg text-sm transition-colors";
const itemOn = "bg-[rgb(255_255_255/0.08)] font-semibold text-sidebar-fg-ativo before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-destaque";
const itemOff = "text-sidebar-fg hover:bg-[rgb(255_255_255/0.05)] hover:text-sidebar-fg-ativo";

function ItensDoModulo({ m, ativoHref, aoNavegar, flutuante }: { m: Modulo; ativoHref?: string; aoNavegar: () => void; flutuante?: boolean }) {
  return (
    <>
      {m.grupos.map((g) => (
        <div key={g.label} className="mt-1 first:mt-0">
          {m.grupos.length > 1 && g.label !== m.nome && <div className={`pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-fg/70 ${flutuante ? "px-3" : "pl-11 pr-3"}`}>{g.label}</div>}
          <ul>
            {g.items.map((i) => {
              const on = ativoHref === i.href;
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={aoNavegar} title={i.label.length > 26 ? i.label : undefined} aria-current={on ? "page" : undefined} className={`${itemBase} h-9 ${flutuante ? "px-3" : "pl-11 pr-3"} ${on ? itemOn : itemOff} ${flutuante ? "before:hidden" : ""}`}>
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Menu lateral: módulos (setores) em sanfona com ícone e rótulo; recolhido, mostra só os ícones e abre os itens num painel ao lado. */
export function NavLateral({ modulos, ativo, recolhida, aoNavegar }: { modulos: Modulo[]; ativo: { href: string; modulo: string } | null; recolhida: boolean; aoNavegar: () => void }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [flutuante, setFlutuante] = useState<string | null>(null);
  const [posFlutuante, setPosFlutuante] = useState({ top: 0, maxHeight: 400 });
  const raiz = useRef<HTMLElement>(null);
  useFecharFora(flutuante !== null, () => setFlutuante(null), raiz);

  return (
    <nav ref={raiz} aria-label="Menu principal" className={`flex-1 px-3 py-2 ${recolhida ? "lg:overflow-visible" : ""} overflow-y-auto`}>
      <ul className="space-y-0.5">
        {modulos.map((m) => {
          const itens = m.grupos.reduce((n, g) => n + g.items.length, 0);
          const doModulo = ativo?.modulo === m.nome;
          const icone = ICONE_MODULO[m.nome] ?? ICONE_ITEM[m.href] ?? "caixa";
          const rotulo = <span className="menu-rotulo truncate">{m.nome}</span>;
          const ico = <Icon name={icone} size={19} className="shrink-0" />;

          if (itens === 1) {
            const on = ativo?.href === m.href;
            return (
              <li key={m.nome}>
                <Link href={m.href} onClick={aoNavegar} title={recolhida ? m.nome : undefined} aria-current={on ? "page" : undefined} className={`${itemBase} h-10 gap-3 px-3 font-medium ${on ? itemOn : itemOff}`}>
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
                  if (!recolhida) return setAbertos((a) => ({ ...a, [m.nome]: !aberto }));
                  // painel ao lado do trilho: fixo na janela, alinhado ao botão e limitado à altura visível
                  const r = e.currentTarget.getBoundingClientRect();
                  const top = Math.max(8, Math.min(r.top, window.innerHeight - 320));
                  setPosFlutuante({ top, maxHeight: window.innerHeight - top - 8 });
                  setFlutuante((f) => (f === m.nome ? null : m.nome));
                }}
                className={`${itemBase} h-10 w-full gap-3 px-3 font-medium ${doModulo ? "text-sidebar-fg-ativo" : itemOff} ${doModulo && recolhida ? itemOn : ""}`}
              >
                {ico}
                {rotulo}
                <Icon name="seta" size={15} className={`menu-rotulo ml-auto shrink-0 opacity-60 transition-transform ${aberto ? "rotate-180" : ""}`} />
              </button>
              {!recolhida && aberto && (
                <div className="pb-1.5">
                  <ItensDoModulo m={m} ativoHref={ativo?.href} aoNavegar={aoNavegar} />
                </div>
              )}
              {recolhida && flutuante === m.nome && (
                <div style={posFlutuante} className="fixed left-[5.25rem] z-50 hidden w-64 overflow-y-auto rounded-xl border border-[rgb(255_255_255/0.1)] bg-sidebar p-2 shadow-xl lg:block">
                  <div className="px-3 pb-1 pt-1.5 font-display text-sm font-bold text-sidebar-fg-ativo">{m.nome}</div>
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

/** Rodapé do menu lateral: avatar, nome e perfil; abre aparência (tema e posição do menu), trocar senha e sair. */
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
    <div ref={ref} className="relative border-t border-[rgb(255_255_255/0.1)] p-3">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Menu do usuário ${nome}`}
        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-[rgb(255_255_255/0.06)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-destaque font-display text-xs font-extrabold text-sidebar">{iniciais(nome)}</span>
        <span className="menu-rotulo min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-sidebar-fg-ativo">{nome}</span>
          <span className="block truncate text-xs capitalize text-sidebar-fg">{perfil}</span>
        </span>
        <Icon name="seta" size={15} className="menu-rotulo shrink-0 rotate-180 text-sidebar-fg" />
      </button>
      {aberto && (
        <div role="dialog" aria-label="Menu do usuário" className={`absolute z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${recolhida ? "bottom-3 left-full ml-3" : "bottom-full left-3 mb-2"}`}>
          <PainelUsuario nome={nome} perfil={perfil} sair={sair} posicao={posicao} mudarPosicao={mudarPosicao} fechar={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Contêiner do menu lateral: fixo e recolhível no desktop; gaveta com fundo escurecido no celular.
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
        className={`barra-lateral fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-fg shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none print:hidden ${soCelular ? "lg:hidden" : ""} ${gaveta ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 px-4">
          <Link href="/" aria-label="Início" onClick={fecharGaveta} className="min-w-0 flex-1 overflow-hidden rounded-lg py-1">
            <span className="marca-completa block">{marca}</span>
            {/* menu recolhido: só o símbolo, a logo horizontal não cabe em 72 px */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/isotipo-branco.png" alt="" aria-hidden="true" className="marca-isotipo mx-auto hidden h-8 w-auto" />
          </Link>
          <button type="button" onClick={fecharGaveta} aria-label="Fechar menu" className="flex h-9 w-9 items-center justify-center rounded-full text-sidebar-fg hover:bg-[rgb(255_255_255/0.1)] lg:hidden">
            <Icon name="fechar" size={18} />
          </button>
        </div>
        {children}
        {!soCelular && <button
          type="button"
          onClick={alternarRecolhida}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          title={recolhida ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-[1.375rem] hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-teal-700 lg:flex"
        >
          <Icon name="direita" size={14} className={recolhida ? "" : "rotate-180"} />
        </button>}
      </aside>
    </>
  );
}
