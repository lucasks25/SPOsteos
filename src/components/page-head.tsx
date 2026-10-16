"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/components/nav";

/** Migalha acima do título: o nome do módulo da tela atual. */
export function EyebrowDaPagina() {
  const pathname = usePathname();
  let melhor: { href: string; modulo: string } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const bate = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (bate && (!melhor || i.href.length > melhor.href.length)) melhor = { href: i.href, modulo: g.modulo ?? g.label };
  }
  if (!melhor || pathname === "/") return null; // no painel o módulo e o título são a mesma palavra
  return <span className="mb-1 block text-xs font-semibold uppercase leading-tight tracking-[0.06em] text-teal-700">{melhor.modulo}</span>;
}
