import Link from "next/link";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import type { IndicadoresComerciais } from "@/app/(app)/comercial/_lib/publico";

/** Gráfico de vendas faturadas dos últimos 6 meses (por mês da NF, horário de Brasília). Só leitura. */
export function Vendas6Meses({ meses }: { meses: IndicadoresComerciais["meses"] }) {
  const maxVenda = Math.max(1, ...meses.map((m) => m.total));
  return (
    <Card title="Vendas faturadas — 6 meses" icon="grafico">
      <div className="mb-3 flex gap-4 text-xs font-medium text-slate-600">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-200" /> vendido</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> margem</span>
      </div>
      <div className="flex h-48 items-end gap-3" role="img" aria-label="Gráfico de vendas mensais">
        {meses.map((m) => (
          <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
            <div className="tnum text-xs text-slate-600">{m.total ? money(m.total).replace(/,\d{2}$/, "") : ""}</div>
            <div className="relative w-full max-w-16 overflow-hidden rounded-t-lg bg-teal-200" style={{ height: `${(m.total / maxVenda) * 140}px`, minHeight: m.total ? 4 : 1 }} title={`${m.label}: ${money(m.total)} · margem ${money(m.margem)}`}>
              <div className="absolute bottom-0 w-full bg-teal-600" style={{ height: `${m.total ? Math.max(0, (m.margem / m.total) * 100) : 0}%` }} />
            </div>
            <div className="text-xs capitalize text-slate-600">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="-mx-4 -mb-4 mt-4 border-t border-slate-200 py-2.5 text-center">
        <Link href="/comercial/comissoes" className="text-xs font-semibold text-teal-700 hover:underline">Ver tudo</Link>
      </div>
    </Card>
  );
}
