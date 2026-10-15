import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:mb-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-slate-200 bg-white", className)}>
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const btnBase =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";
export const btn = {
  primary: cx(btnBase, "bg-teal-700 text-white shadow-sm hover:bg-teal-800 active:bg-teal-900"),
  secondary: cx(btnBase, "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100"),
  danger: cx(btnBase, "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800"),
  ghost: cx(btnBase, "text-teal-700 hover:bg-teal-50"),
  small: "inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50",
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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
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
  return <td className={cx("whitespace-nowrap px-3 py-2 align-middle text-slate-700", className)}>{children}</td>;
}

/** Estado vazio: ícone discreto, mensagem curta e, se houver, a ação que resolve. */
export function EmptyState({ text, action, icon = "caixa" }: { text: string; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm text-slate-500">{text}</p>
      {action}
    </div>
  );
}

const badgeColors = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};
const dotColors: Record<keyof typeof badgeColors, string> = {
  gray: "bg-slate-400",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-sky-500",
  teal: "bg-teal-500",
  purple: "bg-violet-500",
};
export type BadgeColor = keyof typeof badgeColors;

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: BadgeColor }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeColors[color])}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dotColors[color])} aria-hidden="true" />
      {children}
    </span>
  );
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx("tnum mt-1 text-2xl font-semibold tracking-tight", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Barra de busca simples via GET (?q=) */
export function SearchBar({ placeholder = "Buscar...", defaultValue, children }: { placeholder?: string; defaultValue?: string; children?: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full max-w-sm">
        <Icon name="busca" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
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
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
