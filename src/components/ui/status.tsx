import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "./base";

const badgeColors = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-700",
  blue: "bg-sky-50 text-sky-700",
  teal: "bg-teal-50 text-teal-700",
  purple: "bg-violet-50 text-violet-700",
};
export type BadgeColor = keyof typeof badgeColors;

/** Status em etiqueta pequena (20 px, raio 4 px): texto na cor semântica sobre o fundo claro da mesma cor (ERPNext "Overdue"/"Paid"). */
export function Badge({ children, color = "gray", title }: { children: ReactNode; color?: BadgeColor; title?: string }) {
  return (
    <span title={title} className={cx("etiqueta inline-flex h-5 items-center whitespace-nowrap rounded-sm px-1.5 text-xs font-medium print:border print:border-current", badgeColors[color])}>
      {children}
    </span>
  );
}

const STATUS_COR: Record<string, BadgeColor> = {
  QUARENTENA: "yellow", LIBERADO: "green", NAO_CONFORME: "red", BLOQUEADO: "red", VENCIDO: "red",
  AGENDADA: "blue", CONFIRMADA: "teal", REALIZADA: "purple", FATURADA: "green", CANCELADA: "gray",
  ABERTA: "yellow", ENVIADA: "blue", CONFERIDA: "green",
  ABERTO: "yellow", PARCIAL: "blue", RECEBIDO: "green", FATURADO: "green", CANCELADO: "gray", PAGO: "green",
  CONTADO: "blue", FECHADO: "green",
  EM_ANDAMENTO: "blue", CONCLUIDO: "green", PENDENTE: "yellow", COMUNICADO: "blue", RECOLHIDO: "green", SEM_SALDO: "gray",
  RASCUNHO: "gray", ENVIADO: "blue", APROVADO: "green", RECUSADO: "red",
  SOLICITADA: "yellow", AUTORIZADA: "green", NEGADA: "red", EXPIRADA: "red", EM_RECURSO: "blue", REVERTIDA: "green", MANTIDA: "gray", NENHUM: "gray",
};

/** Cor padrão para os status usados no sistema; o texto sai com a primeira letra maiúscula ("Em andamento"). */
export function StatusBadge({ status, title }: { status: string; title?: string }) {
  const t = status.replaceAll("_", " ").toLowerCase();
  return (
    <Badge color={STATUS_COR[status] ?? "gray"} title={title}>
      {t.charAt(0).toUpperCase() + t.slice(1)}
    </Badge>
  );
}

const tomAviso = {
  info: { borda: "border-l-sky-600", icone: "info" as IconName, cor: "text-sky-700" },
  alerta: { borda: "border-l-amber-600", icone: "alerta" as IconName, cor: "text-amber-700" },
  erro: { borda: "border-l-rose-600", icone: "alerta" as IconName, cor: "text-rose-700" },
  ok: { borda: "border-l-emerald-600", icone: "ok" as IconName, cor: "text-emerald-700" },
};

/** Faixa de mensagem: ícone à esquerda e borda esquerda de 3 px na cor semântica, sem fundo pesado. */
export function Aviso({ tom = "info", children, className }: { tom?: keyof typeof tomAviso; children: ReactNode; className?: string }) {
  const t = tomAviso[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cx("aviso flex items-start gap-2.5 rounded-md border border-l-[3px] border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800", t.borda, className)}>
      <Icon name={t.icone} size={16} className={cx("mt-0.5 shrink-0", t.cor)} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
