import { Celula } from "../../financeiro/_lib/visual";
import { KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "../../comercial/_components/filtros";
import { opcoesHospitais } from "../../comercial/_lib/opcoes";
import { abcDados } from "../_lib/consultas";
import { BadgeClasse, BotaoCsv, fmtPct, PERFIS_GESTAO } from "../_lib/visual";

export default async function AbcPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = await searchParams;
  const [d, hospitais] = await Promise.all([abcDados(sp), opcoesHospitais(false)]);
  const { abc } = d;
  const parte = (v: number) => (abc.total > 0 ? fmtPct((v / abc.total) * 100) : "—");
  return (
    <>
      <PageHeader title="Curva ABC de produtos" subtitle="Receita faturada por produto no período (pedidos de venda faturados, data da NF). A = até 80% da receita acumulada, B = até 95%, C = o resto." />
      <KpiGrid cols={5}>
        <Stat label="Receita faturada" value={money(abc.total)} hint={`${d.pedidos} pedido(s) faturado(s)`} />
        <Stat label="Produtos vendidos" value={num(abc.linhas.length)} />
        <Stat label="Classe A" value={num(abc.contagem.A)} hint={`${money(abc.valor.A)} (${parte(abc.valor.A)})`} />
        <Stat label="Classe B" value={num(abc.contagem.B)} hint={`${money(abc.valor.B)} (${parte(abc.valor.B)})`} />
        <Stat label="Classe C" value={num(abc.contagem.C)} hint={`${money(abc.valor.C)} (${parte(abc.valor.C)})`} />
      </KpiGrid>
      <Filtros limparHref="/gestao/abc">
        <FiltroInput label="De" name="de" type="date" defaultValue={d.periodo.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={d.periodo.ate} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={d.hospitalId} />
      </Filtros>
      <Table
        titulo="Produtos por receita"
        icone="grafico"
        contagem={abc.linhas.length}
        acoes={<BotaoCsv href="/gestao/abc/exportar" params={{ de: d.periodo.de, ate: d.periodo.ate, hospital: d.hospitalId }} />}
        head={["#", "Produto", <span key="q" className="block text-right">Quantidade</span>, <span key="r" className="block text-right">Receita</span>, <span key="p" className="block text-right">Participação</span>, <span key="a" className="block text-right">Acumulado</span>, "Classe"]}
        empty={abc.linhas.length === 0}
        emptyText="Nenhum pedido de venda faturado no período e filtros selecionados."
      >
        {abc.linhas.map((l, i) => (
          <tr key={l.id}>
            <Td className="tnum text-slate-500">{i + 1}</Td>
            <Td className="max-w-[24rem]"><Celula principal={l.nome} sub={l.codigo} /></Td>
            <Td className="tnum text-right">{num(l.quantidade)}</Td>
            <Td className="tnum text-right font-semibold">{money(l.valor)}</Td>
            <Td className="tnum text-right">{fmtPct(l.participacao)}</Td>
            <Td className="tnum text-right">{fmtPct(l.acumulado)}</Td>
            <Td><BadgeClasse classe={l.classe} /></Td>
          </tr>
        ))}
        {abc.linhas.length > 0 && (
          <tr className="bg-slate-50 font-semibold">
            <Td />
            <Td>Total</Td>
            <Td className="tnum text-right">{num(abc.linhas.reduce((s, l) => s + l.quantidade, 0))}</Td>
            <Td className="tnum text-right">{money(abc.total)}</Td>
            <Td className="tnum text-right">100,0%</Td>
            <Td />
            <Td />
          </tr>
        )}
      </Table>
    </>
  );
}
