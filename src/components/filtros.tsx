import Link from "next/link";
import type { ReactNode } from "react";
import { FilterBar, btn, campo, cx } from "@/components/ui";

const cls = campo;

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
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">{label}</span>
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
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={cx(cls, className)} />
    </label>
  );
}
