import Link from "next/link";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import type { IndicadoresComerciais } from "@/app/(app)/comercial/_lib/publico";

const curto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 0 });

/** Gráfico de vendas faturadas dos últimos 6 meses (por mês da NF, horário de Brasília). Só leitura. */
export function Vendas6Meses({ meses }: { meses: IndicadoresComerciais["meses"] }) {
  const maxVenda = Math.max(1, ...meses.map((m) => m.total));
  return (
    <Card
      title="Vendas, 6 meses"
      actions={
        <div className="flex items-center gap-3 text-xs text-slate-600 sm:gap-4">
          <Link href="/comercial/comissoes" className="font-semibold text-teal-700 hover:underline">Detalhar</Link>
        </div>
      }
    >
      <div className="mb-2 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-teal-200" /> vendido</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-teal-600" /> margem</span>
      </div>
      <div className="flex h-40 items-end gap-3" role="img" aria-label="Gráfico de vendas mensais">
        {meses.map((m) => (
          <div key={m.chave} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="tnum text-xs text-slate-600">{m.total ? curto.format(m.total) : ""}</div>
            <div className="relative w-full max-w-14 overflow-hidden rounded-t-[3px] bg-teal-200" style={{ height: `${(m.total / maxVenda) * 100}px`, minHeight: m.total ? 4 : 1 }} title={`${m.label}: ${money(m.total)} · margem ${money(m.margem)}`}>
              <div className="absolute bottom-0 w-full bg-teal-600" style={{ height: `${m.total ? Math.max(0, (m.margem / m.total) * 100) : 0}%` }} />
            </div>
            <div className="text-xs capitalize text-slate-600">{m.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
