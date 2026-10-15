import { Badge, btn, type BadgeColor } from "@/components/ui";
import type { Classe } from "./abc";
import type { SituacaoGiro } from "./giro";
import { ROTULO_SITUACAO } from "./giro";
import { qs } from "./periodo";

/** Botão de exportação CSV: leva os mesmos filtros da tela. */
export function BotaoCsv({ href, params }: { href: string; params: Record<string, string | undefined> }) {
  const q = qs(params);
  return (
    <a href={q ? `${href}?${q}` : href} className={btn.small}>
      Exportar CSV
    </a>
  );
}

const COR_CLASSE: Record<Classe, BadgeColor> = { A: "green", B: "yellow", C: "gray" };
export const BadgeClasse = ({ classe }: { classe: Classe }) => <Badge color={COR_CLASSE[classe]}>Classe {classe}</Badge>;

const COR_SITUACAO: Record<SituacaoGiro, BadgeColor> = { RUPTURA: "red", EXCESSO: "yellow", SEM_MOVIMENTO: "purple", OK: "green" };
export const BadgeSituacao = ({ situacao }: { situacao: SituacaoGiro }) => <Badge color={COR_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}</Badge>;

export const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
export const PERFIS_GESTAO = ["COMERCIAL", "ESTOQUE", "COMPRAS", "FINANCEIRO"] as const;
