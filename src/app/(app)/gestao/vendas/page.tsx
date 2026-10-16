import { Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { Filtros, FiltroSelect } from "@/components/filtros";
import { opcoesHospitais } from "@/app/(app)/cadastros/_lib/publico";
import { mesAno } from "@/lib/datas";
import { vendasDados, type SP } from "../_lib/consultas";
import { BotaoCsv, fmtPct, PERFIS_GESTAO } from "../_lib/visual";

const rotulo = (ano: number, mes: number) => mesAno(new Date(Date.UTC(ano, mes - 1, 1)));
const variacao = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${fmtPct(v)}`);

export default async function VendasPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = await searchParams;
  const [d, hospitais] = await Promise.all([vendasDados(sp), opcoesHospitais(false)]);
  const maior = Math.max(1, ...d.meses.flatMap((m) => [m.valor, m.anterior]));
  const altura = (v: number) => `${Math.max(v > 0 ? 2 : 0, Math.round((v / maior) * 100))}%`;
  const melhor = d.meses.reduce((a, m) => (m.valor > a.valor ? m : a), d.meses[0]);
  return (
    <>
      <PageHeader title="Vendas por mês" subtitle="Relatório de leitura: quanto foi faturado em cada um dos últimos 12 meses (data da nota fiscal), comparado ao mesmo mês do ano anterior." />
      <KpiGrid cols={4}>
        <Stat label="Vendas nos 12 meses" value={money(d.total)} hint={`${num(d.pedidos)} pedido(s)`} />
        <Stat label="12 meses anteriores" value={money(d.anterior)} />
        <Stat label="Variação" value={variacao(d.variacaoPct)} tone={d.variacaoPct !== null && d.variacaoPct < 0 ? "danger" : "default"} hint={d.variacaoPct === null ? "sem vendas no ano anterior" : undefined} />
        <Stat label="Melhor mês" value={melhor && melhor.valor > 0 ? money(melhor.valor) : "—"} hint={melhor && melhor.valor > 0 ? rotulo(melhor.ano, melhor.mes) : undefined} />
      </KpiGrid>
      <Filtros limparHref="/gestao/vendas">
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={d.hospitalId} />
      </Filtros>
      <div className="space-y-3">
        <Card
          title="Vendas mensais"
          icon="tendencia"
          actions={
            <span className="flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-700" />Mês</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />Mesmo mês do ano anterior</span>
            </span>
          }
        >
          <div role="img" aria-label="Gráfico de barras das vendas dos últimos 12 meses, com o mesmo mês do ano anterior" className="flex h-48 items-end gap-1.5 sm:gap-3">
            {d.meses.map((m) => (
              <div key={m.chave} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${rotulo(m.ano, m.mes)}: ${money(m.valor)} (ano anterior ${money(m.anterior)})`}>
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-5 rounded-t-sm bg-slate-300" style={{ height: altura(m.anterior) }} />
                  <div className="w-1/2 max-w-5 rounded-t-sm bg-teal-700" style={{ height: altura(m.valor) }} />
                </div>
                <span className="tnum whitespace-nowrap text-[10px] text-slate-600">{rotulo(m.ano, m.mes)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Escala até {money(maior)}. Passe o mouse sobre um mês para ver os valores.</p>
        </Card>
        <Table
          titulo="Mês a mês"
          icone="calendario"
          contagem={d.meses.length}
          acoes={<BotaoCsv href="/gestao/vendas/exportar" params={{ hospital: d.hospitalId }} />}
          head={["Mês", <span key="p" className="block text-right">Pedidos</span>, <span key="v" className="block text-right">Vendas</span>, <span key="a" className="block text-right">Ano anterior</span>, <span key="d" className="block text-right">Diferença</span>, <span key="x" className="block text-right">Variação</span>]}
          empty={d.pedidos === 0 && d.anterior === 0}
          emptyText="Nenhum pedido de venda faturado nos últimos 24 meses."
        >
          {d.meses.map((m) => {
            const dif = Math.round((m.valor - m.anterior) * 100) / 100;
            return (
              <tr key={m.chave}>
                <Td className="font-medium">{rotulo(m.ano, m.mes)}</Td>
                <Td className="tnum text-right">{num(m.pedidos)}</Td>
                <Td className="tnum text-right font-semibold">{money(m.valor)}</Td>
                <Td className="tnum text-right">{money(m.anterior)}</Td>
                <Td className={`tnum text-right ${dif < 0 ? "text-rose-600" : ""}`}>{money(dif)}</Td>
                <Td className={`tnum text-right ${m.variacaoPct !== null && m.variacaoPct < 0 ? "text-rose-600" : ""}`}>{variacao(m.variacaoPct)}</Td>
              </tr>
            );
          })}
          <tr className="bg-slate-50 font-semibold">
            <Td>Total</Td>
            <Td className="tnum text-right">{num(d.pedidos)}</Td>
            <Td className="tnum text-right">{money(d.total)}</Td>
            <Td className="tnum text-right">{money(d.anterior)}</Td>
            <Td className="tnum text-right">{money(Math.round((d.total - d.anterior) * 100) / 100)}</Td>
            <Td className="tnum text-right">{variacao(d.variacaoPct)}</Td>
          </tr>
        </Table>
      </div>
    </>
  );
}
