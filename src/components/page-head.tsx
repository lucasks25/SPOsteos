"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/components/nav";

/** Migalha acima do título (breadcrumb do cabeçalho Fiori): o nome do módulo da tela atual. */
export function EyebrowDaPagina() {
  const pathname = usePathname();
  let melhor: { href: string; modulo: string } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const bate = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (bate && (!melhor || i.href.length > melhor.href.length)) melhor = { href: i.href, modulo: g.modulo ?? g.label };
  }
  if (!melhor || pathname === "/") return null; // no painel o módulo e o título são a mesma palavra
  return <span className="mb-0.5 block text-sm leading-tight text-slate-600">{melhor.modulo}</span>;
}
