import Link from "next/link";
import { Celula, SemRecuo } from "@/components/lista";
import { Icon } from "@/components/icons";
import { Card, KpiGrid, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { CabecalhoImpresso } from "@/components/marca";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { FAIXAS_AGING } from "../_lib/aging";
import { carregarAging } from "../_lib/aging-dados";
import { hojeUTC } from "@/lib/datas";
import type { Tipo } from "../_lib/config";

function Aging({ tipo, titulo, parceiro, dados }: { tipo: Tipo; titulo: string; parceiro: string; dados: Awaited<ReturnType<typeof carregarAging>> }) {
  return (
      <Table
        titulo={titulo}
        contagem={dados.linhas.length}
        acoes={
          <span className="flex items-center gap-2 print:hidden">
            <Link href={tipo === "receber" ? "/financeiro/receber?vencidos=1" : "/financeiro/pagar?vencidos=1"} className={btn.small}>Ver vencidos</Link>
            <a href={`/financeiro/relatorios/exportar?tipo=${tipo}`} className={btn.small}>
              Exportar CSV
            </a>
          </span>
        }
        head={[parceiro, "Títulos", ...FAIXAS_AGING, "Total", "Maior atraso"]}
        relatorio
        rodape={
          dados.linhas.length > 0 ? (
            <tr>
              <Td>Total</Td>
              <Td className="text-right tnum">{dados.linhas.reduce((s, l) => s + l.qtd, 0)}</Td>
              {dados.totais.map((v, i) => (
                <Td key={i} className={`text-right tnum ${i > 0 && v > 0 ? "text-rose-600" : ""}`}>{money(v)}</Td>
              ))}
              <Td className="text-right tnum">{money(dados.total)}</Td>
              <Td />
            </tr>
          ) : undefined
        }
        empty={dados.linhas.length === 0}
        emptyText="Nada em aberto. Nenhum título a mostrar."
      >
        {dados.linhas.map((l) => (
          <tr key={l.parceiroId ?? "sem"}>
            <Td className="max-w-[16rem] truncate" title={l.parceiro}>{l.parceiro}</Td>
            <Td className="text-right tnum">{l.qtd}</Td>
            {l.faixas.map((v, i) => (
              <Td key={i} className={`text-right tnum ${i > 0 && v > 0 ? "text-rose-600" : ""}`}>{v ? money(v) : "—"}</Td>
            ))}
            <Td className="text-right font-semibold tnum">{money(l.total)}</Td>
            <Td className="text-right tnum">{l.maiorAtrasoDias > 0 ? `${l.maiorAtrasoDias} dias` : "—"}</Td>
          </tr>
        ))}
      </Table>
  );
}

export default async function RelatoriosPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const [receber, pagar] = await Promise.all([carregarAging("receber", hoje), carregarAging("pagar", hoje)]);
  return (
    <>
      <div className="hidden print:block">
        <CabecalhoImpresso titulo="Aging de contas a receber e a pagar">
          <p className="text-xs text-slate-600">posição em {date(hoje)}</p>
        </CabecalhoImpresso>
      </div>
      <PageHeader title="Relatórios" subtitle="Saldo em aberto por faixa de atraso, contado a partir do vencimento. Ordenado pelo maior valor vencido." actions={<PrintButton />} />
      <KpiGrid cols={4}>
        <Stat label="A receber em aberto" value={money(receber.total)} hint={`${receber.linhas.length} hospital(is)`} />
        <Stat label="Vencido a receber" value={money(receber.totais.slice(1).reduce((s, v) => s + v, 0))} tone="danger" />
        <Stat label="A pagar em aberto" value={money(pagar.total)} hint={`${pagar.linhas.length} fornecedor(es)`} />
        <Stat label="Vencido a pagar" value={money(pagar.totais.slice(1).reduce((s, v) => s + v, 0))} tone="warn" />
      </KpiGrid>
      <div className="space-y-4">
        <Aging tipo="receber" titulo="Inadimplência por hospital (contas a receber)" parceiro="Hospital" dados={receber} />
        <Aging tipo="pagar" titulo="Contas a pagar por fornecedor" parceiro="Fornecedor" dados={pagar} />
        <Card title="Outros relatórios" className="print:hidden">
          <SemRecuo><ul className="divide-y divide-slate-200">
            {[
              ["/financeiro/dre", "DRE gerencial", "resultado por competência, mês a mês"],
              ["/financeiro/fluxo", "Fluxo de caixa", "previsto e realizado por semana ou mês"],
              ["/financeiro/receber", "Contas a receber", "detalhe título a título"],
              ["/financeiro/pagar", "Contas a pagar", "detalhe título a título"],
            ].map(([href, nome, sub]) => (
              <li key={href}>
                <Link href={href} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50">
                  <Celula principal={<span className="text-teal-700">{nome}</span>} sub={sub} />
                  <Icon name="direita" size={14} className="text-slate-400" />
                </Link>
              </li>
            ))}
          </ul></SemRecuo>
        </Card>
      </div>
    </>
  );
}
