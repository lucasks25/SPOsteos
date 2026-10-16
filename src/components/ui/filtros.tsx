import { Suspense, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { FiltrosAtivos } from "@/components/filtros-ativos";
import { btn, campo, cx } from "./base";

/**
 * Filtros de lista (formulário GET), em dois arranjos:
 * - `barra` (padrão): faixa compacta de uma linha acima da tabela, como a barra de filtros do ERPNext
 *   ("ID · Company · Customer · Status · Filter"). Os 4 primeiros campos ficam à vista; os demais
 *   aparecem em "Mais filtros". Embaixo, os chips dos filtros ativos, cada um removível.
 * - `lateral`: painel à esquerda da tabela, como no Bling (a partir de 1280 px; abaixo disso vira a barra).
 *   Use dentro de <ListaComFiltros filtros={<Filtros layout="lateral">…</Filtros>}>.
 * Os chips leem os rótulos do próprio formulário (filtros-ativos.tsx).
 */
export function FilterBar({ children, className, layout = "barra" }: { children: ReactNode; className?: string; layout?: "barra" | "lateral" }) {
  return (
    <div className={cx("filter-bar rounded-xl border border-slate-200 bg-white print:hidden", layout === "barra" && "mb-4", className)} data-layout={layout}>
      {layout === "lateral" && (
        <div className="filtro-titulo hidden h-10 items-center gap-2 border-b border-slate-200 px-3 text-sm font-semibold text-slate-900">
          <Icon name="filtro" size={15} className="text-slate-500" aria-hidden="true" />
          Filtros
        </div>
      )}
      <form className="filtro-form" role="search">
        {children}
        {layout === "barra" && (
          <div className="filtro-mais">
            <label className="inline-flex h-8 cursor-pointer select-none items-center gap-1 rounded-md px-2 text-sm font-medium text-teal-700 hover:bg-slate-100">
              <input type="checkbox" className="peer sr-only" aria-label="Mostrar mais filtros" />
              <span className="peer-checked:hidden">Mais filtros</span>
              <span className="hidden peer-checked:inline">Menos filtros</span>
              <Icon name="seta" size={14} className="transition-transform peer-checked:rotate-180" aria-hidden="true" />
            </label>
          </div>
        )}
      </form>
      <Suspense fallback={null}>
        <FiltrosAtivos />
      </Suspense>
    </div>
  );
}

/** Lista com painel de filtros à esquerda (Bling): a partir de 1280 px os filtros ficam numa coluna de 15rem, fixa ao rolar. */
export function ListaComFiltros({ filtros, children }: { filtros: ReactNode; children: ReactNode }) {
  return (
    <div className="lista-com-filtros">
      <div className="lista-filtros">{filtros}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Barra de busca simples via GET (?q=) */
export function SearchBar({ placeholder = "Buscar...", defaultValue, children }: { placeholder?: string; defaultValue?: string; children?: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full max-w-sm">
        <Icon name="busca" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label={placeholder} className={cx(campo, "pl-8")} />
      </div>
      {children}
      <button className={btn.secondary}>Buscar</button>
    </form>
  );
}
