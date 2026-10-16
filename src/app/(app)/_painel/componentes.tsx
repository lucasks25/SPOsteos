import Link from "next/link";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { Pendencia } from "./pendencias";

/** Item de "Pendências": quantidade em destaque à esquerda, descrição e nota; a linha inteira leva à tela do módulo dono. */
export function ItemPendencia({ p }: { p: Pendencia }) {
  const texto = p.titulo.replace(/^\d+\s+/, "");
  return (
    <li>
      <Link href={p.href} className="group flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
        <span className={cx("tnum w-7 shrink-0 text-right text-base font-semibold", p.tom === "danger" ? "text-rose-600" : "text-amber-600")}>{p.qtd}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-slate-900 group-hover:text-teal-700">{texto}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-600" title={p.nota}>{p.nota}</span>
        </span>
        <Icon name="direita" size={14} className="shrink-0 self-center text-slate-400 group-hover:text-teal-700" aria-hidden="true" />
      </Link>
    </li>
  );
}
