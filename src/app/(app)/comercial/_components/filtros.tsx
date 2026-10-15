import Link from "next/link";
import type { ReactNode } from "react";
import { FilterBar, btn, cx } from "@/components/ui";

const cls =
  "h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25";

/** Formulário GET de filtros (querystring). */
export function Filtros({ children, limparHref }: { children: ReactNode; limparHref?: string }) {
  return (
    <FilterBar className="print:hidden">
      {children}
      <button className={btn.secondary}>Filtrar</button>
      {limparHref && (
        <Link href={limparHref} className={btn.ghost}>
          Limpar
        </Link>
      )}
    </FilterBar>
  );
}

export function FiltroSelect({
  label,
  name,
  options,
  defaultValue,
  todos = "Todos",
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  todos?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={cx(cls, "min-w-36 max-w-56")}>
        <option value="">{todos}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FiltroInput({ label, name, defaultValue, type = "text", placeholder, className }: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string; className?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={cx(cls, className)} />
    </label>
  );
}
