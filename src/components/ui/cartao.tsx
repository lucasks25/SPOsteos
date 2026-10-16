import type { ReactNode } from "react";
import type { IconName } from "@/components/icons";
import { cx } from "./base";

/**
 * Cartão de seção: borda de 1 px, raio 8 px, sem sombra; cabeçalho de 44 px com título de 15 px e ações à direita.
 * `icon` é aceito por compatibilidade e não é mais desenhado (o quadradinho de ícone repetido em todo cartão saiu).
 * `semRecuo` tira o recuo do corpo (tabela ou lista de borda a borda); `rodape` é uma faixa cinza no pé do cartão.
 */
export function Card({
  title,
  actions,
  children,
  className,
  semRecuo,
  rodape,
  id,
}: {
  title?: string;
  /** @deprecated não é mais desenhado */
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  semRecuo?: boolean;
  rodape?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cx("cartao min-w-0 rounded-xl border border-slate-200 bg-white print:break-inside-avoid print:border-slate-300", className)}>
      {(title || actions) && (
        <div className="cartao-cabeca flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-1.5">
          {title && <h2 className="min-w-0 text-[0.9375rem] font-semibold leading-snug text-slate-900">{title}</h2>}
          {actions && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {semRecuo ? children : <div className="@container p-4">{children}</div>}
      {rodape && <div className="rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-2 text-sm">{rodape}</div>}
    </section>
  );
}

/**
 * Pares rótulo-valor no padrão do formulário do Odoo: rótulo à esquerda (cinza, largura fixa) e valor à direita,
 * linhas separadas por um fio; duas colunas a partir de 640 px (`cols` 1 ou 3 quando fizer sentido).
 */
export function Dl({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  const grade = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 xl:grid-cols-3" }[cols];
  return (
    <dl className={cx("dl-pares grid grid-cols-1 gap-x-8 text-sm", grade)}>
      {items.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline gap-3 border-b border-slate-100 py-1.5">
          <dt className="w-36 shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 flex-1 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
