import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { EyebrowDaPagina } from "@/components/page-head";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * Cabeçalho de página (Dynamic Page do Fiori): faixa branca de borda a borda com módulo (migalha), título,
 * subtítulo e ações globais à direita. KpiGrid e FilterBar logo abaixo entram na mesma faixa (globals.css).
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 bg-white pb-3 pt-4 shadow-[var(--shadow-header)] print:bg-transparent print:p-0 print:shadow-none">
      <div className="min-w-0">
        <span className="print:hidden"><EyebrowDaPagina /></span>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon, actions, children, className }: { title?: string; icon?: IconName; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none", className)}>
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <Icon name={icon} size={16} className="shrink-0 text-slate-500" aria-hidden="true" />}
            {title && <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

/**
 * Botões no estilo Fiori Horizon (2.25rem, raio 0.5rem):
 * primary = Emphasized (uma ação principal por tela), secondary = Default, ghost = Transparent,
 * danger = Reject (fundo vermelho claro, texto vermelho), small = compacto (1.625rem) para dentro de tabelas.
 */
const btnBase =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40";
export const btn = {
  primary: cx(btnBase, "bg-primary font-bold text-on-primary hover:bg-primary-hover active:bg-primary-active"),
  secondary: cx(btnBase, "border border-slate-300 bg-white font-semibold text-teal-700 hover:bg-slate-100 active:bg-slate-200"),
  danger: cx(btnBase, "border border-rose-200 bg-rose-100 font-semibold text-rose-600 hover:bg-rose-200 active:border-rose-300"),
  ghost: cx(btnBase, "font-semibold text-teal-700 hover:bg-slate-100 active:bg-slate-200"),
  small: "inline-flex h-[1.625rem] items-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40",
};

/** Campo de entrada no estilo Horizon: borda clara com linha inferior mais forte, raio 0.25rem, foco com a cor de foco do tema. */
export const campo =
  "h-9 w-full rounded-sm border border-slate-300 border-b-field bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-teal-400 focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:bg-rose-50 aria-[invalid=true]:focus:ring-rose-500";

export function LinkButton({ href, children, variant = "primary", icon }: { href: string; children: ReactNode; variant?: keyof typeof btn; icon?: IconName }) {
  return (
    <Link href={href} className={btn[variant]}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

export function Table({
  head,
  children,
  empty,
  emptyText,
  emptyAction,
  titulo,
  contagem,
  acoes,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  /** barra da tabela (Fiori): título com a contagem "(n)" à esquerda e ações à direita */
  titulo?: string;
  /** mantido por compatibilidade; o estilo Fiori não mostra ícone na barra da tabela */
  icone?: IconName;
  contagem?: number;
  acoes?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none">
      {(titulo || contagem !== undefined || acoes) && (
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
          <h2 className="flex min-w-0 items-baseline gap-1 text-base font-bold text-slate-900">
            {titulo && <span className="truncate">{titulo}</span>}
            {contagem !== undefined &&
              (titulo ? (
                <span className="tnum shrink-0 font-normal text-slate-600">({contagem})</span>
              ) : (
                <span className="tnum shrink-0 text-sm font-normal text-slate-600">
                  {contagem} {contagem === 1 ? "item" : "itens"}
                </span>
              ))}
          </h2>
          {acoes && <div className="flex shrink-0 flex-wrap items-center gap-1">{acoes}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
      {/* densidade compacta (padrão ERP): linhas de 2rem; cabeçalho branco com linha mais forte, sem caixa alta */}
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-300 bg-white">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="h-8 whitespace-nowrap px-3 text-left text-sm font-semibold text-slate-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 [&>tr]:h-8 [&>tr]:transition-colors [&>tr:hover]:bg-slate-100">
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
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("whitespace-nowrap px-3 py-1 align-middle text-slate-900", className)}>{children}</td>;
}

/** Estado vazio ("no data" do Fiori): ícone discreto, por que está vazio e, se houver, a ação que resolve. */
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
  // ObjectStatus do Fiori: texto na cor semântica sobre fundo claro da mesma semântica, contorno interno sutil, sem ponto
  return <span className={cx("inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-xs font-semibold ring-1 ring-inset ring-current/20", badgeColors[color])}>{children}</span>;
}

/** Cor padrão para os status usados no sistema. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeColor> = {
    QUARENTENA: "yellow", LIBERADO: "green", NAO_CONFORME: "red", BLOQUEADO: "red", VENCIDO: "red",
    AGENDADA: "blue", CONFIRMADA: "teal", REALIZADA: "purple", FATURADA: "green", CANCELADA: "gray",
    ABERTA: "yellow", ENVIADA: "blue", CONFERIDA: "green",
    ABERTO: "yellow", PARCIAL: "blue", RECEBIDO: "green", FATURADO: "green", CANCELADO: "gray", PAGO: "green",
    CONTADO: "blue", FECHADO: "green",
    EM_ANDAMENTO: "blue", CONCLUIDO: "green", PENDENTE: "yellow", COMUNICADO: "blue", RECOLHIDO: "green", SEM_SALDO: "gray",
    RASCUNHO: "gray", ENVIADO: "blue", APROVADO: "green", RECUSADO: "red",
    SOLICITADA: "yellow", AUTORIZADA: "green", NEGADA: "red", EXPIRADA: "red", EM_RECURSO: "blue", REVERTIDA: "green", MANTIDA: "gray", NENHUM: "gray",
  };
  return <Badge color={map[status] ?? "gray"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "danger" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-sm text-slate-600">{label}</div>
      <div className={cx("tnum mt-0.5 text-xl font-bold", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>
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
          className={cx(campo, "pl-8 pr-3")}
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
          <dt className="text-sm text-slate-600">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Barra de filtros da List Report (formulário GET): recolhível (Mostrar/Ocultar filtros), campos à esquerda, ações no fim.
 * Logo abaixo do PageHeader ela entra na faixa do cabeçalho (globals.css).
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <details open className={cx("filter-bar group mb-4 rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <summary className="flex h-9 w-fit list-none items-center gap-1 rounded-lg px-3 text-sm font-semibold text-teal-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <Icon name="seta" size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        <span className="group-open:hidden">Mostrar filtros</span>
        <span className="hidden group-open:inline">Ocultar filtros</span>
      </summary>
      <form className="flex flex-wrap items-end gap-2 px-3 pb-3" role="search">
        {children}
      </form>
    </details>
  );
}

/** Faixa de indicadores (facetas de cabeçalho do Fiori): rótulo, valor em destaque e nota; células separadas por linhas finas. */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const c = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return (
    <div className="kpi-strip mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* as linhas finas vêm das bordas das células; -mr/-mb escondem a borda da última coluna e linha, e célula faltante não vira quadro vazio */}
      <div
        className={cx(
          "-mb-px -mr-px grid grid-cols-2",
          "[&>*]:rounded-none [&>*]:border-0 [&>*]:border-b [&>*]:border-r [&>*]:border-slate-200 [&>*]:bg-white [&>*]:shadow-none",
          c,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Título de uma seção dentro da tela (acima de uma tabela, por exemplo). */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold text-slate-900">{children}</h2>
      {actions}
    </div>
  );
}
