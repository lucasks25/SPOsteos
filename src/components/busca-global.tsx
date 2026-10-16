"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ICONE_ITEM, type IconName } from "@/components/icons";
import type { NavGroup } from "@/components/nav";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Dado = { tipo: string; titulo: string; subtitulo: string; href: string };
type Linha = { id: string; href: string; icone: IconName; titulo: string; direita: string; secao: "Telas" | "Dados" };

const ICONE_TIPO: Record<string, IconName> = {
  produto: "pacote", hospital: "predio", fornecedor: "caminhao", medico: "medico", cirurgia: "atividade",
  "pedido-venda": "carrinho", "pedido-compra": "carrinho", lote: "frasco", receber: "receber", pagar: "pagar",
};

/** Busca global (Ctrl/Cmd+K): filtra as telas do menu na hora e, abaixo, procura dados no servidor (GET /api/busca). */
export function BuscaGlobal({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState(0);
  const [res, setRes] = useState<{ termo: string; dados: Dado[]; aviso: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const todos = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, modulo: g.modulo ?? g.label, grupo: g.label }))), [groups]);
  const termo = q.trim();
  const telas = useMemo(() => {
    const t = semAcento(termo);
    if (!t) return [];
    return todos.filter((i) => semAcento(`${i.label} ${i.modulo} ${i.grupo}`).includes(t)).slice(0, 5);
  }, [termo, todos]);

  // dados: debounce de 250 ms, cancela a requisição anterior. `res` guarda o termo a que a resposta pertence.
  useEffect(() => {
    if (termo.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const fim = (dados: Dado[], aviso = "") => setRes({ termo, dados, aviso });
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(termo.slice(0, 60))}`, { signal: ctl.signal, headers: { Accept: "application/json" } });
        if (r.status === 429) fim([], "Muitas buscas seguidas. Aguarde alguns segundos.");
        else if (!r.ok || !r.headers.get("content-type")?.includes("json")) fim([], "Não foi possível buscar dados agora.");
        else fim(((await r.json()) as { resultados?: Dado[] }).resultados ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") fim([], "Não foi possível buscar dados agora.");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [termo]);
  const buscando = termo.length >= 2 && res?.termo !== termo;
  const dados = useMemo(() => (res && res.termo === termo ? res.dados : []), [res, termo]);
  const aviso = res && res.termo === termo ? res.aviso : "";

  const linhas: Linha[] = useMemo(
    () => [
      ...telas.map((i, n): Linha => ({ id: `bt-${n}`, href: i.href, icone: ICONE_ITEM[i.href] ?? "caixa", titulo: i.label, direita: i.modulo, secao: "Telas" })),
      ...dados.map((d, n): Linha => ({ id: `bd-${n}`, href: d.href, icone: ICONE_TIPO[d.tipo] ?? "caixa", titulo: d.titulo, direita: d.subtitulo, secao: "Dados" })),
    ],
    [telas, dados],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ir = (href: string) => {
    setQ("");
    setAberto(false);
    ref.current?.blur();
    router.push(href);
  };

  const mostrar = aberto && termo.length > 0;
  const ativa = linhas[sel];

  return (
    <div className="relative w-full max-w-[520px]" role="search">
      <Icon name="busca" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, linhas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter" && ativa) {
            e.preventDefault();
            ir(ativa.href);
          } else if (e.key === "Escape") {
            setQ("");
            setAberto(false);
            ref.current?.blur();
          }
        }}
        maxLength={60}
        placeholder="Buscar telas, produtos, lotes, cirurgias…"
        aria-label="Buscar telas e dados do sistema"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls="busca-lista"
        aria-autocomplete="list"
        aria-activedescendant={mostrar && ativa ? ativa.id : undefined}
        className="h-9 w-full rounded-full border border-slate-300 bg-slate-50 pl-9 pr-14 text-sm text-slate-900 placeholder:text-slate-500 hover:border-teal-400 focus:border-focus focus:bg-white focus:outline-none focus:ring-1 focus:ring-focus"
      />
      {!termo && <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-white px-1.5 text-[11px] leading-5 text-slate-500 sm:block">Ctrl K</kbd>}
      {mostrar && (
        <ul id="busca-lista" role="listbox" aria-label="Resultados da busca" className="absolute left-0 right-0 top-10 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-[var(--shadow-overlay)]">
          {(["Telas", "Dados"] as const).map((secao) => {
            const itens = linhas.filter((l) => l.secao === secao);
            return (
              <li key={secao} role="presentation">
                <div className="flex items-center gap-2 px-3 pb-0.5 pt-1.5 text-[11px] font-bold uppercase tracking-[.04em] text-slate-500">
                  {secao}
                  {secao === "Dados" && buscando && <span className="font-normal normal-case tracking-normal" role="status">buscando…</span>}
                </div>
                <ul role="group" aria-label={secao}>
                  {itens.length === 0 && !(secao === "Dados" && buscando) && (
                    <li className="px-3 py-1.5 text-[13px] text-slate-500">
                      {secao === "Dados" ? (aviso || (termo.length < 2 ? "Digite ao menos 2 caracteres para buscar dados." : "Nenhum dado encontrado.")) : "Nenhuma tela encontrada."}
                    </li>
                  )}
                  {itens.map((l) => {
                    const idx = linhas.indexOf(l);
                    return (
                      <li key={l.id} id={l.id} role="option" aria-selected={idx === sel}>
                        <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(idx)} onClick={() => ir(l.href)} className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] ${idx === sel ? "bg-teal-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}>
                          <Icon name={l.icone} size={15} className="shrink-0 text-slate-500" />
                          <span className="min-w-0 flex-1 truncate font-medium">{l.titulo}</span>
                          <span className="ml-2 max-w-[45%] shrink-0 truncate text-xs text-slate-500">{l.direita}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
