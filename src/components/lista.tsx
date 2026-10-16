import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/** Rodapé "Ver tudo" de cartão-resumo; use como último filho de um Card com <CardCorpo>. */
export function VerTudo({ href, children = "Ver tudo" }: { href: string; children?: ReactNode }) {
  return (
    <div className="-mx-4 -mb-4 mt-4 rounded-b-xl border-t border-slate-200 px-4 py-2 text-right text-xs font-medium print:hidden">
      <Link href={href} className="text-teal-700 hover:underline">
        {children}
      </Link>
    </div>
  );
}

/**
 * Célula principal em duas linhas: nome (link opcional, azul) e subtítulo cinza menor.
 * Na primeira coluna, o link estica sobre a linha inteira (linha clicável, componentes.css).
 */
export function Celula({ href, principal, sub, className }: { href?: string; principal: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 leading-tight", className)}>
      <div className="truncate font-medium">{href ? <Link href={href} className="link-linha text-teal-700 hover:underline">{principal}</Link> : principal}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Anula o padding do Card para listas que vão de borda a borda. */
export function SemRecuo({ children }: { children: ReactNode }) {
  return <div className="-m-4">{children}</div>;
}
