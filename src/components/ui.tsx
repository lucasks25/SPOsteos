import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:mb-3">
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded border border-slate-200 bg-white shadow-sm print:shadow-none", className)}>
      {(title || actions) && (
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
          {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

const btnBase =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded px-3 text-[13px] font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";
export const btn = {
  primary: cx(btnBase, "bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900"),
  secondary: cx(btnBase, "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100"),
  danger: cx(btnBase, "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800"),
  ghost: cx(btnBase, "text-teal-700 hover:bg-teal-50"),
  small: "inline-flex h-7 items-center rounded px-2 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-50",
};

export function LinkButton({ href, children, variant = "primary", icon }: { href: string; children: ReactNode; variant?: keyof typeof btn; icon?: IconName }) {
  return (
    <Link href={href} className={btn[variant]}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

export function Table({ head, children, empty, emptyText, emptyAction }: { head: ReactNode[]; children: ReactNode; empty?: boolean; emptyText?: string; emptyAction?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white shadow-sm print:shadow-none">
      <table className="min-w-full text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[.04em] text-slate-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 [&>tr]:h-9 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-12">
                <EmptyState text={emptyText ?? "Nenhum registro encontrado."} action={emptyAction} />
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("whitespace-nowrap px-3 py-1.5 align-middle text-slate-800", className)}>{children}</td>;
}

/** Estado vazio: ícone discreto, mensagem curta e, se houver, a ação que resolve. */
export function EmptyState({ text, action, icon = "caixa" }: { text: string; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm text-slate-500">{text}</p>
      {action}
    </div>
  );
}

const badgeColors = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-600",
  blue: "bg-sky-50 text-sky-700",
  teal: "bg-teal-50 text-teal-700",
  purple: "bg-violet-50 text-violet-700",
};
export type BadgeColor = keyof typeof badgeColors;

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: BadgeColor }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold leading-4", badgeColors[color])}>{children}</span>;
}

/** Cor padrão para os status usados no sistema. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeColor> = {
    QUARENTENA: "yellow", LIBERADO: "green", NAO_CONFORME: "red", BLOQUEADO: "red", VENCIDO: "red",
    AGENDADA: "blue", CONFIRMADA: "teal", REALIZADA: "purple", FATURADA: "green", CANCELADA: "gray",
    ABERTA: "yellow", ENVIADA: "blue", CONFERIDA: "green",
    ABERTO: "yellow", PARCIAL: "blue", RECEBIDO: "green", FATURADO: "green", CANCELADO: "gray", PAGO: "green",
    RASCUNHO: "gray", ENVIADO: "blue", APROVADO: "green", RECUSADO: "red",
  };
  return <Badge color={map[status] ?? "gray"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "danger" }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-600">{label}</div>
      <div className={cx("tnum mt-1 text-2xl font-bold", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </div>
  );
}

/** Barra de busca simples via GET (?q=) */
export function SearchBar({ placeholder = "Buscar...", defaultValue, children }: { placeholder?: string; defaultValue?: string; children?: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full max-w-sm">
        <Icon name="busca" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-3 text-[13px] text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25"
        />
      </div>
      {children}
      <button className={btn.secondary}>Filtrar</button>
    </form>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-slate-600">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Barra de filtros acima de uma lista (formulário GET): campos à esquerda, ações no fim. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form className={cx("mb-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3 shadow-sm", className)} role="search">
      {children}
    </form>
  );
}

/** Faixa de indicadores (Stat) no topo da tela. */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const c = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return <div className={cx("mb-4 grid grid-cols-2 gap-3", c)}>{children}</div>;
}

/** Título de uma seção dentro da tela (acima de uma tabela, por exemplo). */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-slate-900">{children}</h2>
      {actions}
    </div>
  );
}
