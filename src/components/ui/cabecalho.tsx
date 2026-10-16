import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { EyebrowDaPagina } from "@/components/page-head";
import { MaisAcoes } from "@/components/mais-acoes";
import { cx, Dica } from "./base";

/**
 * Cabeçalho de página no padrão dos ERPs de mercado (ERPNext: título à esquerda e ações à direita na mesma linha;
 * Odoo/ERPNext no registro: trilha "Módulo / Lista", título e status ao lado).
 * - `voltar`: vira a trilha "Módulo / <label>" com link para a lista (sem `label`, mostra "Voltar").
 * - `status`: pílula de situação ao lado do título (ex.: <StatusBadge/>).
 * - `meta`: metadados curtos em linha, separados por "·" (hospital · origem · competência).
 * - `subtitle`: não vira mais parágrafo sob o título (ERP real não tem subtítulo explicativo); aparece no "i" ao lado do título.
 * - `actions` sempre visíveis (a principal por último, à direita); `maisAcoes` vão para o menu "Mais ações".
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  maisAcoes,
  voltar,
  status,
  meta,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  maisAcoes?: ReactNode;
  voltar?: { href: string; label?: string };
  status?: ReactNode;
  meta?: ReactNode[];
}) {
  const metas = (meta ?? []).filter((m) => m !== null && m !== undefined && m !== false && m !== "");
  return (
    <div className="page-head mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 print:mb-3">
      <div className="min-w-0 flex-1">
        <nav aria-label="Trilha" className="mb-0.5 flex min-h-4 items-center gap-1.5 text-xs text-slate-500 print:hidden">
          <EyebrowDaPagina />
          {voltar && (
            <>
              <span aria-hidden="true" className="text-slate-400 [&:first-child]:hidden">/</span>
              <Link href={voltar.href} className="font-medium text-teal-700 hover:underline">
                {voltar.label ?? "Voltar"}
              </Link>
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className={cx("min-w-0 font-semibold leading-tight text-slate-900", voltar ? "text-[1.375rem]" : "text-xl")}>{title}</h1>
          {subtitle && <Dica>{subtitle}</Dica>}
          {status}
        </div>
        {metas.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-600">
            {metas.map((m, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true" className="text-slate-400">·</span>}
                <span className="min-w-0">{m}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {(actions || maisAcoes) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-[60%] sm:justify-end print:hidden">
          {maisAcoes && <MaisAcoes>{maisAcoes}</MaisAcoes>}
          {actions}
        </div>
      )}
    </div>
  );
}

/** Título de uma seção dentro da tela (acima de uma tabela, por exemplo). */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex min-h-9 items-center justify-between gap-3">
      <h2 className="text-[0.9375rem] font-semibold text-slate-900">{children}</h2>
      {actions}
    </div>
  );
}

/** Abas de navegação (links), como o notebook do Odoo e as abas do ERPNext: sublinhado azul na ativa; contagem opcional. */
export function Abas({ itens, className }: { itens: { href: string; label: string; ativo?: boolean; contagem?: number }[]; className?: string }) {
  return (
    <nav className={cx("abas mb-4 flex overflow-x-auto border-b border-slate-200 print:hidden", className)}>
      {itens.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.ativo ? "page" : undefined}
          className={cx(
            "relative -mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
            a.ativo ? "border-teal-600 font-semibold text-slate-900" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
          )}
        >
          {a.label}
          {a.contagem !== undefined && <span className="tnum rounded-sm bg-slate-100 px-1.5 text-xs font-medium text-slate-600">{a.contagem}</span>}
        </Link>
      ))}
    </nav>
  );
}
