import Link from "next/link";
import { money } from "@/lib/format";
import { cx } from "@/components/ui";

export type FaixaAging = { rotulo: string; valor: number; qtd: number; cor: string; href?: string; destaque?: boolean };

/**
 * Aging em barra empilhada com legenda e tabela de faixas, como o relatório "Accounts Receivable" do ERPNext
 * (barra simples por faixa de vencimento + totais por faixa embaixo). As cores vêm dos tokens (bg-*-500 etc.).
 */
export function AgingBarra({ faixas, total }: { faixas: FaixaAging[]; total: number }) {
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-slate-100" role="img" aria-label={faixas.map((f) => `${f.rotulo}: ${money(f.valor)}`).join("; ")}>
        {total > 0 &&
          faixas.map((f) =>
            f.valor > 0 ? <span key={f.rotulo} className={cx("h-full border-r border-white last:border-r-0", f.cor)} style={{ width: `${(f.valor / total) * 100}%` }} /> : null,
          )}
      </div>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {faixas.map((f) => (
            <tr key={f.rotulo} className="h-8 border-b border-slate-100 last:border-b-0">
              <td className="py-1">
                <span className="inline-flex items-center gap-2">
                  <span className={cx("h-2.5 w-2.5 shrink-0 rounded-sm", f.cor)} aria-hidden="true" />
                  {f.href && f.qtd > 0 ? (
                    <Link href={f.href} className="text-slate-700 hover:text-teal-700 hover:underline">
                      {f.rotulo}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{f.rotulo}</span>
                  )}
                </span>
              </td>
              <td className="tnum w-12 py-1 text-right text-xs text-slate-500">{f.qtd}</td>
              <td className={cx("tnum w-36 py-1 text-right", f.destaque && f.valor > 0 ? "font-semibold text-rose-600" : "text-slate-900")}>{money(f.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
