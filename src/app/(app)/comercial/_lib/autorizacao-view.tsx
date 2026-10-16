import { Aviso, Badge, type BadgeColor } from "@/components/ui";
import type { Achado, ResultadoRisco, Severidade } from "./autorizacao";

const COR: Record<Severidade, BadgeColor> = { grave: "red", atencao: "yellow", info: "blue" };
const ROTULO: Record<Severidade, string> = { grave: "Grave", atencao: "Atenção", info: "Informativo" };

/** Lista de achados da verificação de risco de glosa, com a severidade de cada um. */
export function PainelAchados({ risco }: { risco: ResultadoRisco }) {
  if (!risco.aplicavel) return null;
  if (risco.achados.length === 0) {
    return (
      <Aviso tom="ok">Sem risco de glosa por autorização: o material consumido está dentro do autorizado.</Aviso>
    );
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white" aria-label="Achados da verificação de risco de glosa">
      {risco.achados.map((a, i) => (
        <li key={`${a.codigo}-${a.produtoId ?? i}`} className="flex items-start gap-3 px-3 py-2 text-sm">
          <span className="mt-0.5 w-24 shrink-0"><Badge color={COR[a.severidade]}>{ROTULO[a.severidade]}</Badge></span>
          <span>
            <span className="font-medium text-slate-900">{a.titulo}</span>
            <span className="block text-xs text-slate-600">{a.detalhe}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Texto do diálogo de confirmação do faturamento quando há achado grave (só aviso: o usuário decide). */
export function textoAvisoFaturamento(achados: Achado[], acao: string): string {
  const graves = achados.filter((a) => a.severidade === "grave");
  const linhas = graves.slice(0, 5).map((a) => `• ${a.titulo}`).join("\n");
  const mais = graves.length > 5 ? `\n• e mais ${graves.length - 5} achado(s)` : "";
  return `Risco de glosa: ${graves.length} achado(s) grave(s) na autorização do convênio.\n${linhas}${mais}\n\nDeseja ${acao} mesmo assim?`;
}
