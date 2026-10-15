"use client";

import { usePathname } from "next/navigation";
import { Icon, ICONE_ITEM } from "@/components/icons";
import { NAV } from "@/components/nav";

/** Quadradinho azul com o ícone da tela e o nome do módulo (migalha pequena), como no cabeçalho de página do Vionex V2. */
export function MarcaDaPagina() {
  const pathname = usePathname();
  let melhor: { href: string; modulo: string } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const bate = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (bate && (!melhor || i.href.length > melhor.href.length)) melhor = { href: i.href, modulo: g.modulo ?? g.label };
  }
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-teal-700 text-white" aria-hidden="true">
        <Icon name={ICONE_ITEM[melhor?.href ?? ""] ?? "caixa"} size={18} />
      </span>
    </span>
  );
}

export function EyebrowDaPagina() {
  const pathname = usePathname();
  let melhor: { href: string; modulo: string } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const bate = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (bate && (!melhor || i.href.length > melhor.href.length)) melhor = { href: i.href, modulo: g.modulo ?? g.label };
  }
  return melhor ? <span className="block text-[11px] leading-none text-slate-500">{melhor.modulo}</span> : null;
}
