import type { ReactNode } from "react";
import { cx } from "@/components/ui";

type Tom = "default" | "warn" | "danger" | "ok";
const cor: Record<Tom, string> = { default: "text-slate-900", warn: "text-amber-600", danger: "text-rose-600", ok: "text-emerald-700" };

/**
 * Linha de totais discreta acima de uma lista (padrão ERPNext/Odoo: "11 de 11", sem tiles de KPI).
 * Rótulo cinza, valor em algarismos tabulares; a cor só aparece quando há algo a tratar.
 */
export function Totais({ itens }: { itens: { label: string; valor: ReactNode; tom?: Tom }[] }) {
  return (
    <p className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-slate-600">
      {itens.map((i) => (
        <span key={i.label} className="tnum whitespace-nowrap">
          {i.label} <strong className={cx("font-semibold", cor[i.tom ?? "default"])}>{i.valor}</strong>
        </span>
      ))}
    </p>
  );
}
