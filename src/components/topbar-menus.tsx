"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export type MenuId = "ajuda" | "sino";

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
        <div id={`menu-${id}`} role="dialog" aria-label={rotulo} className={`absolute right-0 top-10 z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg bg-white shadow-[var(--shadow-overlay)] ${largura}`}>
          {children}
        </div>
      )}
    </div>
  );
}

const botaoIcone = "relative flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900";

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
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
          </svg>
        </button>
      )}
    >
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-bold text-slate-900">Atalhos de teclado</div>
      <dl className="px-3 py-2">
        {ATALHOS_AJUDA.map(([tecla, desc]) => (
          <div key={tecla} className="flex items-center justify-between gap-3 py-1 text-sm">
            <dt className="text-slate-700">{desc}</dt>
            <dd>
              <kbd className="whitespace-nowrap rounded border border-slate-300 bg-slate-50 px-1.5 text-[11px] leading-5 text-slate-700">{tecla}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">Os atalhos de uma tecla não funcionam enquanto você digita em um campo.</div>
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
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {total > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">{total > 9 ? "9+" : total}</span>}
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-bold text-slate-900">Pendências{total ? ` (${total})` : ""}</span>
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
              <Link data-item href={i.href} onClick={() => setAberto(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 focus:bg-teal-50 focus:outline-none">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${i.tom === "danger" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`} aria-hidden="true">
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
