"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/components/nav";
import { cx } from "@/components/ui";

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  // um item cujo href é prefixo de outro item (ex.: "/financeiro" e "/financeiro/receber") só vale na rota exata
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    if (hrefs.some((h) => h !== href && h.startsWith(href + "/"))) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };
  return (
    <nav className="space-y-5 px-3 py-4 text-sm">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-teal-200/70">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className={cx(
                    "block rounded-md px-2 py-1.5",
                    active(i.href) ? "bg-white/15 font-medium text-white" : "text-teal-50/85 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
