import Link from "next/link";
import { Card, PageHeader, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { FAIXAS_AGING } from "../_lib/aging";
import { carregarAging } from "../_lib/aging-dados";
import { hojeUTC } from "../_lib/datas";
import type { Tipo } from "../_lib/config";

function Aging({ tipo, titulo, parceiro, dados }: { tipo: Tipo; titulo: string; parceiro: string; dados: Awaited<ReturnType<typeof carregarAging>> }) {
  return (
    <Card
      title={titulo}
      actions={
        <a href={`/financeiro/relatorios/exportar?tipo=${tipo}`} className={btn.secondary}>
          Exportar CSV
        </a>
      }
    >
      <Table head={[parceiro, "Títulos", ...FAIXAS_AGING, "Total", "Maior atraso"]} empty={dados.linhas.length === 0} emptyText="Nada em aberto. Nenhum título a mostrar.">
        {dados.linhas.map((l) => (
          <tr key={l.parceiroId ?? "sem"}>
            <Td className="max-w-[16rem] truncate">{l.parceiro}</Td>
            <Td className="text-right tnum">{l.qtd}</Td>
            {l.faixas.map((v, i) => (
              <Td key={i} className={`text-right tnum ${i > 0 && v > 0 ? "text-rose-700" : ""}`}>{v ? money(v) : "—"}</Td>
            ))}
            <Td className="text-right font-semibold tnum">{money(l.total)}</Td>
            <Td className="text-right tnum">{l.maiorAtrasoDias > 0 ? `${l.maiorAtrasoDias} dias` : "—"}</Td>
          </tr>
        ))}
        {dados.linhas.length > 0 && (
          <tr className="bg-slate-50 font-semibold">
            <Td>Total</Td>
            <Td className="text-right" />
            {dados.totais.map((v, i) => (
              <Td key={i} className="text-right tnum">{money(v)}</Td>
            ))}
            <Td className="text-right tnum">{money(dados.total)}</Td>
            <Td className="text-right" />
          </tr>
        )}
      </Table>
    </Card>
  );
}

export default async function RelatoriosPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const [receber, pagar] = await Promise.all([carregarAging("receber", hoje), carregarAging("pagar", hoje)]);
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Saldo em aberto por faixa de atraso, contado a partir do vencimento. Ordenado pelo maior valor vencido." />
      <div className="space-y-4">
        <Aging tipo="receber" titulo="Inadimplência por hospital (contas a receber)" parceiro="Hospital" dados={receber} />
        <Aging tipo="pagar" titulo="Contas a pagar por fornecedor" parceiro="Fornecedor" dados={pagar} />
        <p className="text-xs text-slate-500">
          Quer o detalhe título a título? Veja <Link href="/financeiro/receber" className="text-teal-700 hover:underline">contas a receber</Link> e <Link href="/financeiro/pagar" className="text-teal-700 hover:underline">contas a pagar</Link>.
        </p>
      </div>
    </>
  );
}
