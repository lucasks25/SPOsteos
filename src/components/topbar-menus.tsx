"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { definirTema } from "@/lib/tema-actions";

export type MenuId = "ajuda" | "sino";
/** Posição do menu principal: coluna à esquerda (padrão) ou barra no topo com menus suspensos (estilo Bling). */
export type PosicaoMenu = "esquerda" | "topo";

export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/** Botão de tema na barra superior: alterna claro/escuro a partir do tema em uso (o "Sistema" fica no menu do usuário). */
export function BotaoTema() {
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

const itemMenu = "flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-700";
const segmento = "h-7 rounded-[5px] text-xs font-semibold text-slate-700 hover:text-teal-700 aria-pressed:bg-white aria-pressed:text-teal-700 aria-pressed:shadow-sm";

/**
 * Conteúdo do menu do usuário (rodapé do menu lateral ou avatar da barra no topo): configuração (tema, posição do menu,
 * visual), administração (só ADMIN: usuários e log de auditoria), trocar senha, segurança e sair. A posição do menu só aparece a partir de 1024 px: abaixo disso os dois modos são a mesma gaveta.
 */
/**
 * Visual da plataforma: atual (padrão) ou clássico (protótipo estilo software desktop, estilos/classico.css), para o
 * cliente comparar. Preferência de interface (não sensível), como o `opme_menu`: cookie gravado no navegador e lido no
 * servidor pelo layout raiz (`data-visual` no <html>) e pelo Painel; a página recarrega para tudo nascer no modo certo.
 */
function SeletorVisual() {
  const atual = document.documentElement.dataset.visual === "classico" ? "classico" : "atual";
  return (
    <div className="mt-3">
      <div id="rotulo-visual" className="mb-1.5 text-xs text-slate-500">Visual</div>
      <div role="group" aria-labelledby="rotulo-visual" className="grid grid-cols-2 gap-0.5 rounded-md border border-slate-200 bg-slate-100 p-0.5">
        {([["atual", "Atual"], ["classico", "Clássico"]] as const).map(([v, r]) => (
          <button
            key={v}
            type="button"
            aria-pressed={atual === v}
            onClick={() => {
              if (atual === v) return;
              document.cookie = v === "classico" ? "opme_visual=classico; path=/; max-age=31536000; samesite=lax" : "opme_visual=; path=/; max-age=0; samesite=lax";
              window.location.reload();
            }}
            className={segmento}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PainelUsuario({ nome, perfil, sair, posicao, mudarPosicao, fechar }: {
  nome: string;
  perfil: string;
  sair: () => Promise<void>;
  posicao: PosicaoMenu;
  mudarPosicao: (p: PosicaoMenu) => void;
  fechar: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="truncate text-sm font-bold text-slate-900">{nome}</div>
        <div className="text-xs capitalize text-slate-500">{perfil}</div>
      </div>
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">Configuração</div>
        <form action={definirTema}>
          <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-0.5 rounded-md border border-slate-200 bg-slate-100 p-0.5">
            {[["claro", "Claro"], ["escuro", "Escuro"], ["auto", "Sistema"]].map(([v, r]) => (
              <button key={v} name="tema" value={v} className={segmento}>
                {r}
              </button>
            ))}
          </div>
        </form>
        <div className="mt-3 hidden lg:block">
          <div id="rotulo-posicao-menu" className="mb-1.5 text-xs text-slate-500">Posição do menu</div>
          <div role="group" aria-labelledby="rotulo-posicao-menu" className="grid grid-cols-2 gap-0.5 rounded-md border border-slate-200 bg-slate-100 p-0.5">
            {([["esquerda", "À esquerda"], ["topo", "No topo"]] as const).map(([v, r]) => (
              <button
                key={v}
                type="button"
                aria-pressed={posicao === v}
                onClick={() => {
                  fechar();
                  if (posicao !== v) mudarPosicao(v);
                }}
                className={segmento}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <SeletorVisual />
      </div>
      {perfil.toUpperCase() === "ADMIN" && (
        <div className="border-b border-slate-200 py-1">
          <div className="px-4 pb-1 pt-2 text-xs font-semibold text-slate-600">Administração</div>
          <Link href="/admin/usuarios" onClick={fechar} className={itemMenu}>
            <Icon name="usuarios" size={16} />
            Usuários
          </Link>
          <Link href="/admin/auditoria" onClick={fechar} className={itemMenu}>
            <Icon name="lista" size={16} />
            Log de auditoria
          </Link>
        </div>
      )}
      <Link href="/conta/senha" onClick={fechar} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-700">
        <Icon name="cadeado" size={16} />
        Trocar minha senha
      </Link>
      <Link href="/conta/seguranca" onClick={fechar} className="flex w-full items-center gap-2.5 border-b border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-700">
        <Icon name="cadeado" size={16} />
        Segurança (2º fator e sessões)
      </Link>
      <form action={sair}>
        <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-rose-600">
          <Icon name="sair" size={16} />
          Sair
        </button>
      </form>
    </>
  );
}

/** Dropdown da barra superior: fecha com Esc (devolvendo o foco ao botão) e ao clicar fora. */
function Suspenso({ id, aberto, setAberto, botao, rotulo, largura = "w-64", children }: {
  id: MenuId;
  aberto: boolean;
  setAberto: (a: boolean) => void;
  botao: (p: { className: string }) => ReactNode;
  rotulo: string;
  largura?: string;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        raiz.current?.querySelector<HTMLButtonElement>("[data-gatilho]")?.focus();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, setAberto]);

  // setas movem o foco entre os itens (role=menuitem ou link dentro do painel)
  const teclas = (e: ReactKeyEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const itens = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-item]") ?? []);
    if (itens.length === 0) return;
    e.preventDefault();
    const i = itens.indexOf(document.activeElement as HTMLElement);
    itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length].focus();
  };

  return (
    <div ref={raiz} className="relative" onKeyDown={teclas}>
      {botao({ className: "" })}
      {aberto && (
        <div id={`menu-${id}`} role="dialog" aria-label={rotulo} className={`absolute right-0 top-12 z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${largura}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export const botaoIcone = "relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-expanded:bg-teal-50 aria-expanded:text-teal-700";

const ATALHOS_AJUDA: [string, string][] = [
  ["Ctrl K", "Buscar telas e dados"],
  ["G depois P", "Ir para o Painel"],
  ["G depois C", "Ir para Comercial"],
  ["G depois E", "Ir para Estoque"],
  ["G depois F", "Ir para Financeiro"],
  ["?", "Abrir esta ajuda"],
  ["Esc", "Fechar menu ou busca"],
];

export function MenuAjuda({ aberto, setAberto }: { aberto: boolean; setAberto: (a: boolean) => void }) {
  return (
    <Suspenso
      id="ajuda"
      aberto={aberto}
      setAberto={setAberto}
      rotulo="Atalhos de teclado"
      largura="w-72"
      botao={() => (
        <button type="button" data-gatilho onClick={() => setAberto(!aberto)} aria-haspopup="dialog" aria-expanded={aberto} aria-controls="menu-ajuda" aria-label="Ajuda e atalhos de teclado" className={botaoIcone}>
          <Icon name="ajuda" size={19} />
        </button>
      )}
    >
      <div className="border-b border-slate-200 px-4 py-3 font-display text-sm font-bold text-slate-900">Atalhos de teclado</div>
      <dl className="px-4 py-2">
        {ATALHOS_AJUDA.map(([tecla, desc]) => (
          <div key={tecla} className="flex items-center justify-between gap-3 py-1 text-sm">
            <dt className="text-slate-700">{desc}</dt>
            <dd>
              <kbd className="whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold leading-5 text-slate-700">{tecla}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">Os atalhos de uma tecla não funcionam enquanto você digita em um campo.</div>
    </Suspenso>
  );
}

type Pend = { key: string; href: string; icon: IconName; tom: "warn" | "danger"; titulo: string; nota: string };

/** Sino de pendências: contador do que exige ação; atualiza ao abrir e a cada 2 minutos. */
export function Sino({ aberto, setAberto }: { aberto: boolean; setAberto: (a: boolean) => void }) {
  const [itens, setItens] = useState<Pend[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ctl: AbortController | null = null;
    const carregar = async () => {
      ctl?.abort();
      ctl = new AbortController();
      try {
        const r = await fetch("/api/pendencias", { signal: ctl.signal, headers: { Accept: "application/json" } });
        if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error("resposta inválida");
        const j = (await r.json()) as { itens: Pend[] };
        setItens(j.itens);
        setFalhou(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFalhou(true);
      }
    };
    carregar();
    const t = setInterval(() => {
      if (!document.hidden) carregar();
    }, 120_000);
    const volta = () => {
      if (!document.hidden) carregar();
    };
    document.addEventListener("visibilitychange", volta);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", volta);
      ctl?.abort();
    };
  }, []);

  // atualiza também ao abrir
  const aoAbrir = useRef(false);
  useEffect(() => {
    if (aberto && !aoAbrir.current) {
      fetch("/api/pendencias", { headers: { Accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j: { itens: Pend[] }) => {
          setItens(j.itens);
          setFalhou(false);
        })
        .catch(() => setFalhou(true));
    }
    aoAbrir.current = aberto;
  }, [aberto]);

  const total = itens?.length ?? 0;
  return (
    <Suspenso
      id="sino"
      aberto={aberto}
      setAberto={setAberto}
      rotulo="Pendências"
      largura="w-80"
      botao={() => (
        <button type="button" data-gatilho onClick={() => setAberto(!aberto)} aria-haspopup="dialog" aria-expanded={aberto} aria-controls="menu-sino" aria-label={total ? `Pendências: ${total}` : "Pendências"} className={botaoIcone}>
          <Icon name="sino" size={19} />
          {total > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">{total > 9 ? "9+" : total}</span>}
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="font-display text-sm font-bold text-slate-900">Pendências{total ? ` (${total})` : ""}</span>
        <Link href="/" onClick={() => setAberto(false)} className="text-xs font-semibold text-teal-700 hover:underline">Ver no painel</Link>
      </div>
      {itens === null ? (
        <div className="px-3 py-4 text-sm text-slate-500" role="status">{falhou ? "Não foi possível carregar as pendências." : "Carregando…"}</div>
      ) : itens.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-500">Nada pendente para o seu perfil. Tudo em dia.</div>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-slate-200 overflow-y-auto">
          {itens.map((i) => (
            <li key={i.key}>
              <Link data-item href={i.href} onClick={() => setAberto(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 focus:bg-teal-50 focus:outline-none">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i.tom === "danger" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`} aria-hidden="true">
                  <Icon name={i.icon} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{i.titulo}</span>
                  <span className="block truncate text-xs text-slate-600">{i.nota}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {falhou && itens !== null && <div className="border-t border-slate-200 px-3 py-1.5 text-xs text-amber-600">Lista possivelmente desatualizada.</div>}
    </Suspenso>
  );
}

/** Atalhos globais: G depois P/C/E/F navega, ? abre a ajuda. Ignora campos de digitação. */
export function useAtalhosGlobais({ irPara, abrir }: { irPara: (letra: string) => void; abrir: (m: MenuId) => void }) {
  const cbs = useRef({ irPara, abrir });
  useEffect(() => {
    cbs.current = { irPara, abrir };
  });
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      const k = e.key.toLowerCase();
      if (g && Date.now() - g < 1500) {
        g = 0;
        if (["p", "c", "e", "f"].includes(k)) {
          e.preventDefault();
          cbs.current.irPara(k);
          return;
        }
      }
      if (k === "g") g = Date.now();
      else if (e.key === "?") {
        e.preventDefault();
        cbs.current.abrir("ajuda");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
