import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * Botões retangulares de 32 px (raio 6 px; área de toque estendida a 44 px), como nos ERPs de mercado
 * (ERPNext "Add Sales Invoice", Odoo "New"): cor só na ação principal; as demais são neutras.
 * primary = ação principal (uma por tela) · secondary = contorno cinza · ghost = só texto (Cancelar, Limpar)
 * danger = destrutiva (texto vermelho, contorno cinza) · small = 28 px, para dentro de tabelas.
 */
const btnBase =
  "relative inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-100 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] disabled:pointer-events-none disabled:opacity-50";
export const btn = {
  primary: cx(btnBase, "bg-primary font-semibold text-on-primary hover:bg-primary-hover active:bg-primary-active"),
  secondary: cx(btnBase, "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100"),
  danger: cx(btnBase, "border border-slate-300 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 active:bg-rose-100"),
  ghost: cx(btnBase, "px-3 text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"),
  small:
    "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50",
};

/** Campo de entrada: 32 px (ERPNext/Bling: 30–32 px), raio 6 px, borda com contraste 3:1, anel de foco azul suave. */
export const campo =
  "h-8 w-full rounded-md border border-field bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-500 transition-[border-color,box-shadow] hover:border-slate-500 focus:border-teal-600 focus:outline-none focus:ring-3 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-600 aria-[invalid=true]:focus:ring-rose-600/20";

export function LinkButton({ href, children, variant = "primary", icon, title }: { href: string; children: ReactNode; variant?: keyof typeof btn; icon?: IconName; title?: string }) {
  return (
    <Link href={href} className={btn[variant]} title={title}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

/**
 * Ação de linha só com ícone (ver, editar, baixar), com dica no hover e rótulo para leitor de tela.
 * Use na última coluna da tabela, alinhada à direita (padrão das listas do Odoo e do ERPNext).
 */
export function AcaoIcone({ href, icon, label, download }: { href: string; icon: IconName; label: string; download?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      download={download || undefined}
      prefetch={download ? false : undefined}
      className="relative z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      <Icon name={icon} size={16} />
    </Link>
  );
}

/**
 * Ajuda em "i" pequeno (padrão do Bling e do ERPNext): o texto aparece ao passar o mouse ou focar pelo teclado,
 * em vez de um parágrafo explicativo fixo na tela. O texto também fica disponível para leitor de tela.
 * `alinhar="direita"` quando o "i" fica no canto direito (ações de cartão), para a dica abrir para dentro da tela.
 */
export function Dica({ children, className, alinhar = "esquerda" }: { children: ReactNode; className?: string; alinhar?: "esquerda" | "direita" }) {
  return (
    <span tabIndex={0} className={cx("group relative inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-slate-400 hover:text-slate-600 focus-visible:text-slate-600 print:hidden", className)}>
      <Icon name="info" size={15} aria-hidden="true" />
      <span className="sr-only">Ajuda: </span>
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute top-full z-40 mt-1.5 hidden w-max max-w-[min(20rem,80vw)] rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white shadow-lg group-hover:block group-focus-visible:block",
          alinhar === "direita" ? "right-0" : "-left-1",
        )}
      >
        {children}
      </span>
    </span>
  );
}
