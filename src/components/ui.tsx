import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { EyebrowDaPagina } from "@/components/page-head";
import { FiltrosAtivos } from "@/components/filtros-ativos";
import { MaisAcoes } from "@/components/mais-acoes";

export { MaisAcoes };

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * Cabeçalho de página: módulo (migalha), título grande, subtítulo e ações à direita.
 * `actions` ficam sempre visíveis (status, ação principal); `maisAcoes` vão para o menu "Mais ações".
 * Use `maisAcoes` quando houver mais de duas ações: deixe à vista só a principal e uma secundária.
 */
export function PageHeader({ title, subtitle, actions, maisAcoes, voltar }: { title: string; subtitle?: string; actions?: ReactNode; maisAcoes?: ReactNode; voltar?: { href: string; label?: string } }) {
  return (
    <div className="page-head mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6 print:mb-3">
      <div className="min-w-0 flex-1">
        {voltar ? (
          <Link href={voltar.href} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline print:hidden">
            <Icon name="direita" size={14} className="rotate-180" />
            {voltar.label ?? "Voltar"}
          </Link>
        ) : (
          <span className="print:hidden"><EyebrowDaPagina /></span>
        )}
        <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {(actions || maisAcoes) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:max-w-[55%] md:justify-end print:hidden">
          {maisAcoes && <MaisAcoes>{maisAcoes}</MaisAcoes>}
          {actions}
        </div>
      )}
    </div>
  );
}

export function Card({ title, icon, actions, children, className }: { title?: string; icon?: IconName; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm print:border-slate-300 print:shadow-none", className)}>
      {(title || actions) && (
        <div className="flex min-h-13 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-on-accent-soft print:hidden" aria-hidden="true">
                <Icon name={icon} size={16} />
              </span>
            )}
            {title && <h2 className="min-w-0 text-base font-bold leading-snug text-slate-900">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Botões em pílula (40 px de altura, área de toque de 44 px):
 * primary = ação principal (uma por tela), secondary = contorno verde, ghost = só texto,
 * danger = destrutiva (contorno e texto vermelhos), small = compacto (32 px) para dentro de tabelas.
 */
const btnBase =
  "relative inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] disabled:pointer-events-none disabled:opacity-45";
export const btn = {
  primary: cx(btnBase, "bg-primary text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-active"),
  secondary: cx(btnBase, "border border-teal-600/70 bg-white text-teal-700 hover:border-teal-600 hover:bg-teal-50 active:bg-teal-100"),
  danger: cx(btnBase, "border border-rose-300 bg-white text-rose-600 hover:border-rose-400 hover:bg-rose-50 active:bg-rose-100"),
  ghost: cx(btnBase, "px-4 text-teal-700 hover:bg-teal-50 active:bg-teal-100"),
  small: "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-teal-700 transition-colors hover:border-teal-500 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-45",
};

/** Campo de entrada: 40 px, raio 10 px, borda com contraste 3:1, anel de foco verde suave. */
export const campo =
  "h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-[border-color,box-shadow] hover:border-slate-500 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:bg-rose-50 aria-[invalid=true]:focus:ring-rose-500/20";

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
  /** barra da tabela: título com a contagem à esquerda e ações à direita */
  titulo?: string;
  /** mantido por compatibilidade; a barra da tabela não mostra ícone */
  icone?: IconName;
  contagem?: number;
  acoes?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:overflow-visible print:shadow-none">
      {(titulo || contagem !== undefined || acoes) && (
        <div className="flex min-h-13 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-2">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-slate-900">
            {titulo && <span className="truncate">{titulo}</span>}
            {contagem !== undefined &&
              (titulo ? (
                <span className="tnum inline-flex h-6 shrink-0 items-center rounded-full bg-slate-100 px-2 font-sans text-xs font-semibold text-slate-600">{contagem}</span>
              ) : (
                <span className="tnum shrink-0 font-sans text-sm font-normal text-slate-600">
                  {contagem} {contagem === 1 ? "item" : "itens"}
                </span>
              ))}
          </h2>
          {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}
      <div className="tabela-rolagem">
        {/* linhas de 2.5rem, zebra sutil, cabeçalho fixo ao rolar (componentes.css) */}
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className="h-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-left first:pl-4 last:pr-4 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 [&>tr]:h-10 [&>tr]:transition-colors [&>tr:nth-child(even)]:bg-slate-50/50 [&>tr:hover]:bg-teal-50/60">
            {empty ? (
              <tr className="hover:bg-transparent">
                <td colSpan={head.length} className="px-4 py-10">
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
  return <td className={cx("whitespace-nowrap px-3 py-1.5 align-middle text-slate-900 first:pl-4 last:pr-4", className)}>{children}</td>;
}

/** Estado vazio: ícone em círculo verde-claro, por que está vazio e, se houver, a ação que resolve. */
export function EmptyState({ text, action, icon = "caixa", titulo }: { text: string; action?: ReactNode; icon?: IconName; titulo?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-8 ring-teal-50/50" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <div className="max-w-sm">
        {titulo && <p className="font-display text-base font-bold text-slate-900">{titulo}</p>}
        <p className="text-sm text-slate-600">{text}</p>
      </div>
      {action}
    </div>
  );
}

const badgeColors = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-700",
  blue: "bg-sky-50 text-sky-700",
  teal: "bg-teal-50 text-teal-700",
  purple: "bg-violet-50 text-violet-700",
};
export type BadgeColor = keyof typeof badgeColors;

/** Status em pílula: texto na cor semântica sobre o fundo claro da mesma cor, com um ponto à esquerda. */
export function Badge({ children, color = "gray" }: { children: ReactNode; color?: BadgeColor }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset ring-current/15 print:ring-0", badgeColors[color])}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
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
    CONTADO: "blue", FECHADO: "green",
    EM_ANDAMENTO: "blue", CONCLUIDO: "green", PENDENTE: "yellow", COMUNICADO: "blue", RECOLHIDO: "green", SEM_SALDO: "gray",
    RASCUNHO: "gray", ENVIADO: "blue", APROVADO: "green", RECUSADO: "red",
    SOLICITADA: "yellow", AUTORIZADA: "green", NEGADA: "red", EXPIRADA: "red", EM_RECURSO: "blue", REVERTIDA: "green", MANTIDA: "gray", NENHUM: "gray",
  };
  return <Badge color={map[status] ?? "gray"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

const tomStat = {
  default: { valor: "text-slate-900", icone: "bg-accent-soft text-on-accent-soft" },
  warn: { valor: "text-amber-600", icone: "bg-amber-50 text-amber-700" },
  danger: { valor: "text-rose-600", icone: "bg-rose-50 text-rose-600" },
};

/** Indicador em cartão: rótulo, ícone em quadradinho (opcional), número grande e nota. */
export function Stat({ label, value, hint, tone = "default", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "danger"; icon?: IconName }) {
  const t = tomStat[tone];
  const ic = icon ?? (tone === "default" ? undefined : "alerta");
  return (
    <div className="stat h-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-[border-color,box-shadow] print:shadow-none">
      {/* rótulo com a largura toda; o ícone fica na linha do número, para o rótulo não quebrar espremido */}
      <div className="text-[0.8125rem] font-medium leading-snug text-slate-600">{label}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className={cx("tnum min-w-0 font-display text-2xl font-extrabold leading-tight", t.valor)}>{value}</div>
        {ic && (
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg print:hidden", t.icone)} aria-hidden="true">
            <Icon name={ic} size={16} />
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </div>
  );
}

/** Barra de busca simples via GET (?q=) */
export function SearchBar({ placeholder = "Buscar...", defaultValue, children }: { placeholder?: string; defaultValue?: string; children?: ReactNode }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full max-w-md">
        <Icon name="busca" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label={placeholder} className={cx(campo, "rounded-full pl-10 pr-4")} />
      </div>
      {children}
      <button className={btn.secondary}>Buscar</button>
    </form>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words font-medium text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Barra de filtros (formulário GET) em cartão: recolhível, campos lado a lado e chips dos filtros ativos embaixo,
 * cada um removível. Os chips leem os rótulos do próprio formulário (filtros-ativos.tsx).
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("filter-bar mb-5 rounded-xl border border-slate-200 bg-white shadow-sm print:hidden", className)}>
      <details open className="group">
        <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-800 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
          <Icon name="filtro" size={16} className="text-teal-700" aria-hidden="true" />
          Filtros
          <Icon name="seta" size={16} className="ml-auto text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          <span className="sr-only">
            <span className="group-open:hidden">(mostrar)</span>
            <span className="hidden group-open:inline">(ocultar)</span>
          </span>
        </summary>
        <form className="flex flex-wrap items-end gap-3 px-4 pb-4" role="search">
          {children}
        </form>
      </details>
      <Suspense fallback={null}>
        <FiltrosAtivos />
      </Suspense>
    </div>
  );
}

/** Grade de indicadores: cartões lado a lado (2 colunas no celular; 3, 4 ou 5 a partir de 1024 px). */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div className="kpi-strip" data-cols={cols}>
      {children}
    </div>
  );
}

/** Abas de navegação (links): sublinhado verde na aba ativa; contagem opcional em pílula. */
export function Abas({ itens, className }: { itens: { href: string; label: string; ativo?: boolean; contagem?: number }[]; className?: string }) {
  return (
    <nav className={cx("abas mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden", className)}>
      {itens.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.ativo ? "page" : undefined}
          className={cx(
            "relative -mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
            a.ativo ? "border-teal-600 font-semibold text-teal-700" : "border-transparent font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900",
          )}
        >
          {a.label}
          {a.contagem !== undefined && (
            <span className={cx("tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold", a.ativo ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600")}>{a.contagem}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

const tomAviso = {
  info: { caixa: "border-sky-200 bg-sky-50 text-sky-800", icone: "info" as IconName, cor: "text-sky-700" },
  alerta: { caixa: "border-amber-200 bg-amber-50 text-amber-800", icone: "alerta" as IconName, cor: "text-amber-700" },
  erro: { caixa: "border-rose-200 bg-rose-50 text-rose-800", icone: "alerta" as IconName, cor: "text-rose-600" },
  ok: { caixa: "border-emerald-200 bg-emerald-50 text-emerald-800", icone: "ok" as IconName, cor: "text-emerald-700" },
};

/** Faixa de mensagem (informação, alerta, erro ou sucesso) com ícone; use no lugar de divs coloridas soltas. */
export function Aviso({ tom = "info", children, className }: { tom?: keyof typeof tomAviso; children: ReactNode; className?: string }) {
  const t = tomAviso[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", t.caixa, className)}>
      <Icon name={t.icone} size={18} className={cx("mt-px shrink-0", t.cor)} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Título de uma seção dentro da tela (acima de uma tabela, por exemplo). */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
      {actions}
    </div>
  );
}
