"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, ICONE_ITEM } from "@/components/icons";
import type { NavGroup } from "@/components/nav";
import { cx } from "@/components/ui";

/** Menu lateral: grupos que abrem e fecham; o grupo da tela atual fica sempre aberto. */
export function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // um item cujo href é prefixo de outro item (ex.: "/financeiro" e "/financeiro/receber") só vale na rota exata
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    if (hrefs.some((h) => h !== href && h.startsWith(href + "/"))) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };
  const grupoAtivo = groups.find((g) => g.items.some((i) => active(i.href)))?.label;
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const aberto = (label: string) => label === grupoAtivo || !fechados.has(label);
  const alternar = (label: string) =>
    setFechados((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });

  return (
    <nav aria-label="Menu principal" className="space-y-0.5 px-2.5 py-3 text-[13px]">
      {groups.map((g) => {
        const abre = aberto(g.label);
        const unico = g.items.length === 1 && g.label === "Geral";
        return (
          <div key={g.label} className="pb-1">
            {!unico && (
              <button
                type="button"
                onClick={() => alternar(g.label)}
                aria-expanded={abre}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-100/60 transition-colors hover:text-teal-50"
              >
                {g.label}
                <Icon name="seta" size={14} className={cx("transition-transform duration-150", !abre && "-rotate-90")} />
              </button>
            )}
            {(abre || unico) && (
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const ativo = active(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        aria-current={ativo ? "page" : undefined}
                        className={cx(
                          "group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                          ativo ? "bg-white/15 font-medium text-white" : "text-teal-50/80 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <Icon name={ICONE_ITEM[i.href] ?? "caixa"} size={16} className={cx("shrink-0", ativo ? "text-teal-200" : "text-teal-200/60 group-hover:text-teal-100")} />
                        <span className="truncate">{i.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
