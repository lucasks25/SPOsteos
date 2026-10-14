import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50";
export const btn = {
  primary: cx(btnBase, "bg-teal-700 text-white hover:bg-teal-800"),
  secondary: cx(btnBase, "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"),
  danger: cx(btnBase, "bg-rose-600 text-white hover:bg-rose-700"),
  ghost: cx(btnBase, "text-teal-700 hover:bg-teal-50"),
  small: "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50",
};

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: keyof typeof btn }) {
  return (
    <Link href={href} className={btn[variant]}>
      {children}
    </Link>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-slate-400">
                Nenhum registro encontrado.
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
  return <td className={cx("whitespace-nowrap px-4 py-2.5 text-slate-700", className)}>{children}</td>;
}

const badgeColors = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  teal: "bg-teal-100 text-teal-800",
  purple: "bg-violet-100 text-violet-800",
};
export type BadgeColor = keyof typeof badgeColors;

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: BadgeColor }) {
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[color])}>{children}</span>;
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Barra de busca simples via GET (?q=) */
export function SearchBar({ placeholder = "Buscar...", defaultValue, children }: { placeholder?: string; defaultValue?: string; children?: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap gap-2">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
      />
      {children}
      <button className={btn.secondary}>Filtrar</button>
    </form>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-slate-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
