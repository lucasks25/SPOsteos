import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import type { Pendencia } from "./pendencias";

type Tom = "default" | "warn" | "danger" | "ok";
const corTom = { default: "text-slate-900", warn: "text-amber-600", danger: "text-rose-600", ok: "text-emerald-600" };

/** Célula da faixa de indicadores: rótulo, valor e nota colorida; link para a tela do módulo dono. */
export function Indicador({ href, label, value, nota, tom = "default", notaTom }: { href: string; label: string; value: ReactNode; nota?: ReactNode; tom?: Tom; notaTom?: Tom }) {
  return (
    <Link href={href} className="block px-3 py-2.5 transition-colors duration-150 hover:bg-slate-50">
      <div className="text-xs text-slate-600">{label}</div>
      <div className={cx("tnum mt-0.5 text-xl font-bold", corTom[tom])}>{value}</div>
      {nota && <div className={cx("mt-0.5 text-xs", notaTom ? corTom[notaTom] : "text-slate-600")}>{nota}</div>}
    </Link>
  );
}

/** Item de "Pendências": ícone colorido, título com contagem, nota e link "Abrir" para a tela do módulo dono (só navegação). */
export function ItemPendencia({ p }: { p: Pendencia }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded text-white", p.tom === "danger" ? "bg-rose-600" : "bg-amber-500")} aria-hidden="true">
        <Icon name={p.icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={p.href} className="block truncate text-[13px] font-semibold text-teal-700 hover:underline">{p.titulo}</Link>
        <div className="truncate text-xs text-slate-600">{p.nota}</div>
      </div>
      <Link href={p.href} className={btn.small}>Abrir</Link>
    </li>
  );
}
