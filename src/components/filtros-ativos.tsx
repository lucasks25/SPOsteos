"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type Chip = { chave: string; rotulo: string; valor: string };

/** Parâmetros que não são filtros (paginação, ordenação). */
const IGNORAR = new Set(["page", "pagina", "ordem", "_rsc"]);

function textoDoCampo(form: HTMLFormElement, chave: string, valor: string): Chip | null {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${CSS.escape(chave)}"]`);
  if (!el) return null;
  const label = el.closest("label");
  const rotulo = (label?.querySelector("span")?.textContent ?? label?.textContent ?? chave).replace(/\s*\*$/, "").trim();
  if (el instanceof HTMLSelectElement) {
    const op = Array.from(el.options).find((o) => o.value === valor);
    return { chave, rotulo, valor: op?.textContent?.trim() || valor };
  }
  if (el.type === "checkbox") return { chave, rotulo: label?.textContent?.trim() || rotulo, valor: "" };
  if (el.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return { chave, rotulo, valor: `${d}/${m}/${a}` };
  }
  if (el.type === "hidden") {
    // Combobox: o texto escolhido fica no campo visível ao lado do oculto
    const visivel = label?.querySelector<HTMLInputElement>("input:not([type=hidden])");
    return { chave, rotulo, valor: visivel?.value || valor };
  }
  return { chave, rotulo, valor };
}

/**
 * Chips dos filtros ativos, abaixo da barra de filtros: um por parâmetro da URL que corresponde a um campo do formulário,
 * cada um com "×" para remover só aquele filtro, e "Limpar tudo". Lê rótulos e textos do próprio formulário.
 */
export function FiltrosAtivos() {
  const params = useSearchParams();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [chips, setChips] = useState<Chip[]>([]);

  useEffect(() => {
    const form = ref.current?.closest(".filter-bar")?.querySelector("form");
    if (!form) return;
    const lista: Chip[] = [];
    params.forEach((valor, chave) => {
      if (!valor || IGNORAR.has(chave)) return;
      const c = textoDoCampo(form, chave, valor);
      if (c) lista.push(c);
    });
    setChips(lista);
  }, [params]);

  const sem = (chave: string) => {
    const p = new URLSearchParams(params.toString());
    p.delete(chave);
    p.delete("page");
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  return (
    <div ref={ref} className={chips.length ? "flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2.5" : "hidden"}>
      {chips.length > 0 && (
        <>
          <span className="text-xs font-semibold text-slate-500">Filtros ativos</span>
          {chips.map((c) => (
            <span key={c.chave} className="inline-flex h-7 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 pl-3 pr-1 text-xs text-teal-800">
              <span className="font-semibold">
                {c.rotulo}
                {c.valor && ":"}
              </span>
              {c.valor && <span className="max-w-48 truncate">{c.valor}</span>}
              <Link href={sem(c.chave)} aria-label={`Remover filtro ${c.rotulo}`} className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full hover:bg-teal-100">
                <Icon name="fechar" size={12} />
              </Link>
            </span>
          ))}
          <Link href={pathname} className="ml-1 text-xs font-semibold text-teal-700 hover:underline">
            Limpar tudo
          </Link>
        </>
      )}
    </div>
  );
}
