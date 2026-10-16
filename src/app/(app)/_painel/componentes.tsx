import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import type { Pendencia } from "./pendencias";

type Tom = "default" | "warn" | "danger" | "ok";
const corTom = { default: "text-slate-900", warn: "text-amber-600", danger: "text-rose-600", ok: "text-emerald-600" };

const corIcone = { default: "bg-accent-soft text-on-accent-soft", warn: "bg-amber-50 text-amber-700", danger: "bg-rose-50 text-rose-600", ok: "bg-emerald-50 text-emerald-700" };

/** Cartão de indicador do painel: rótulo, ícone em quadradinho, número grande e nota colorida; leva à tela do módulo dono. */
export function Indicador({ href, label, value, nota, tom = "default", notaTom, icone }: { href: string; label: string; value: ReactNode; nota?: ReactNode; tom?: Tom; notaTom?: Tom; icone?: IconName }) {
  return (
    <Link href={href} className="group block">
      <div className="flex items-start justify-between gap-3">
        <div className="pt-0.5 text-[0.8125rem] font-medium text-slate-600">{label}</div>
        {icone && (
          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", corIcone[tom])} aria-hidden="true">
            <Icon name={icone} size={18} />
          </span>
        )}
      </div>
      <div className={cx("tnum mt-1.5 font-display text-2xl font-extrabold leading-tight", corTom[tom])}>{value}</div>
      {nota && <div className={cx("mt-1 text-xs", notaTom ? corTom[notaTom] : "text-slate-600")}>{nota}</div>}
    </Link>
  );
}

/** Item de "Pendências": ícone colorido, título com contagem, nota e link "Abrir" para a tela do módulo dono (só navegação). */
export function ItemPendencia({ p }: { p: Pendencia }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", p.tom === "danger" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")} aria-hidden="true">
        <Icon name={p.icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={p.href} className="block truncate text-sm font-semibold text-slate-900 hover:text-teal-700 hover:underline">{p.titulo}</Link>
        <div className="truncate text-xs text-slate-600">{p.nota}</div>
      </div>
      <Link href={p.href} className={btn.small}>Abrir</Link>
    </li>
  );
}
