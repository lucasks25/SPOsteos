import Link from "next/link";
import type { ReactNode } from "react";
import { btn } from "@/components/ui";

const cls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

/** Formulário GET de filtros (querystring). */
export function Filtros({ children, limparHref }: { children: ReactNode; limparHref?: string }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
      {children}
      <button className={btn.secondary}>Filtrar</button>
      {limparHref && (
        <Link href={limparHref} className={btn.ghost}>
          Limpar
        </Link>
      )}
    </form>
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
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={`${cls} max-w-56`}>
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

export function FiltroInput({ label, name, defaultValue, type = "text", placeholder }: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={cls} />
    </label>
  );
}
