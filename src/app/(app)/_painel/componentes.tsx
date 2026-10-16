import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";
import type { Pendencia } from "./pendencias";

type Tom = "default" | "warn" | "danger" | "ok";
const corTom = { default: "text-slate-900", warn: "text-amber-600", danger: "text-rose-600", ok: "text-emerald-600" };

const corIcone = { default: "bg-accent-soft text-on-accent-soft", warn: "bg-amber-50 text-amber-700", danger: "bg-rose-50 text-rose-600", ok: "bg-emerald-50 text-emerald-700" };

/** Cartão de indicador do painel: rótulo, ícone em quadradinho, número grande e nota colorida; leva à tela do módulo dono. */
export function Indicador({ href, label, value, nota, tom = "default", notaTom, icone }: { href: string; label: string; value: ReactNode; nota?: ReactNode; tom?: Tom; notaTom?: Tom; icone?: IconName }) {
  return (
    <Link href={href} className="group block">
      {/* rótulo com a largura toda; o ícone fica na linha do número, para o rótulo não quebrar espremido */}
      <div className="text-[0.8125rem] font-medium leading-snug text-slate-600">{label}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className={cx("tnum min-w-0 font-display text-xl font-extrabold leading-tight sm:text-2xl", corTom[tom])}>{value}</div>
        {icone && (
          <span className={cx("hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex", corIcone[tom])} aria-hidden="true">
            <Icon name={icone} size={16} />
          </span>
        )}
      </div>
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
        <Link href={p.href} className="block text-sm font-semibold leading-snug text-slate-900 hover:text-teal-700 hover:underline">{p.titulo}</Link>
        <div className="mt-0.5 truncate text-xs text-slate-600" title={p.nota}>{p.nota}</div>
      </div>
      <Link href={p.href} aria-label={`Abrir: ${p.titulo}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-teal-50 hover:text-teal-700">
        <Icon name="direita" size={16} />
      </Link>
    </li>
  );
}
