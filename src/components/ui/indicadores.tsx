import Link from "next/link";
import type { ReactNode } from "react";
import type { IconName } from "@/components/icons";
import { cx } from "./base";

const tomValor = {
  default: "text-slate-900",
  ok: "text-emerald-700",
  info: "text-teal-700",
  warn: "text-amber-600",
  danger: "text-rose-600",
};

export type TomStat = keyof typeof tomValor;

/**
 * Indicador: célula de uma faixa de números (KpiGrid), sem cartão próprio e sem ícone.
 * Rótulo curto (12 px), valor (20 px, algarismos tabulares) na cor do `tone` e uma nota de UMA linha (cortada com reticências).
 * - `tone`: default | ok | info | warn | danger (pinta o valor).
 * - `delta`: variação com seta, verde quando é boa e vermelha quando é ruim (`bom` decide; padrão: subir é bom).
 * - `href`: a célula inteira vira link (filtro ou relatório correspondente).
 * `icon` é aceito por compatibilidade e não é mais desenhado.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  delta,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: TomStat;
  /** @deprecated não é mais desenhado */
  icon?: IconName;
  delta?: { valor: string; direcao: "sobe" | "desce"; bom?: boolean };
  href?: string;
}) {
  const bom = delta ? (delta.bom ?? delta.direcao === "sobe") : false;
  const corpo = (
    <>
      <div className="truncate text-xs font-medium text-slate-600" title={label}>
        {label}
      </div>
      <div className={cx("tnum mt-1 truncate text-lg font-semibold leading-tight sm:text-xl", tomValor[tone])}>{value}</div>
      {(hint || delta) && (
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          {delta && (
            <span className={cx("tnum shrink-0 font-semibold", bom ? "text-emerald-700" : "text-rose-600")}>
              <span aria-hidden="true">{delta.direcao === "sobe" ? "▲" : "▼"}</span> {delta.valor}
            </span>
          )}
          {hint && <span className="min-w-0 truncate" title={typeof hint === "string" ? hint : undefined}>{hint}</span>}
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="stat block min-w-0 hover:bg-slate-50">
        {corpo}
      </Link>
    );
  }
  return <div className="stat min-w-0">{corpo}</div>;
}

/**
 * Faixa de indicadores: UM contorno, células separadas por fios finos (não cartões soltos), alturas iguais.
 * 2 colunas no celular; `cols` 3/4 a partir de 1024 px; 5 vira 3 colunas até 1279 px.
 * Serve também como faixa de fatos-chave no cabeçalho de um registro (detalhe).
 */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div className="kpi-strip">
      <div className="kpi-grade" data-cols={cols}>
        {children}
      </div>
    </div>
  );
}
