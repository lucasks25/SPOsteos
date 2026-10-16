import { KpiGrid, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "@/components/filtros";
import { opcoesConvenios, opcoesHospitais } from "../../comercial/_lib/opcoes";
import { CATEGORIAS_GLOSA, ROTULO_CATEGORIA_GLOSA } from "../../financeiro/_lib/publico";
import { glosasDados, type SP } from "../_lib/consultas";
import type { LinhaOrigem } from "../_lib/glosas";
import { BotaoCsv, fmtPct, PERFIS_GLOSAS } from "../_lib/visual";

export default async function GlosasPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser([...PERFIS_GLOSAS]);
  const sp = await searchParams;
  const [d, hospitais, convenios] = await Promise.all([glosasDados(sp), opcoesHospitais(false), opcoesConvenios()]);
  const params = { de: d.periodo.de, ate: d.periodo.ate, hospital: d.hospitalId, convenio: d.convenioId, categoria: d.categoria };

  const origem = (titulo: string, rotulo: string, icone: "escudo" | "predio", linhas: LinhaOrigem[], por: string) => (
    <Table
      titulo={titulo}
      icone={icone}
      contagem={linhas.length}
      acoes={<BotaoCsv href="/gestao/glosas/exportar" params={{ ...params, por }} />}
      head={[rotulo, <span key="f" className="block text-right">Faturado</span>, <span key="g" className="block text-right">Glosado</span>, <span key="q" className="block text-right">Glosas</span>, <span key="p" className="block text-right">% glosa</span>]}
      empty={linhas.length === 0}
      emptyText="Nenhum faturamento nem glosa no período e filtros selecionados."
    >
      {linhas.map((l) => (
        <tr key={l.id}>
          <Td className="font-medium">{l.nome}</Td>
          <Td className="tnum text-right">{money(l.faturado)}</Td>
          <Td className="tnum text-right font-semibold">{money(l.glosado)}</Td>
          <Td className="tnum text-right">{num(l.qtd)}</Td>
          <Td className={`tnum text-right ${l.pct !== null && l.pct >= 10 ? "text-rose-600" : ""}`}>{fmtPct(l.pct)}</Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title="Glosas por convênio e motivo" subtitle="Valor glosado bruto das glosas lançadas no período (inclui as revertidas depois; o líquido aparece à parte) sobre o faturado no mesmo período (data da NF). Como a glosa costuma chegar semanas depois da nota, o percentual de períodos curtos é aproximado." />
      <KpiGrid cols={4}>
        <Stat label="Valor glosado" value={money(d.glosado)} tone={d.glosado > 0 ? "warn" : "default"} hint={`${num(d.qtd)} glosa(s) · líquido ${money(d.liquido)}`} />
        <Stat label="% do faturado" value={fmtPct(d.pct)} hint={`faturado ${money(d.faturado)} (${num(d.pedidos)} pedido(s))`} />
        <Stat label="Em recurso" value={money(d.emRecurso.valor)} hint={`${num(d.emRecurso.qtd)} glosa(s)`} />
        <Stat label="Revertidas" value={money(d.revertidas.valor)} hint={`${num(d.revertidas.qtd)} glosa(s) · mantidas ${money(d.mantidas.valor)}`} />
      </KpiGrid>
      <Filtros limparHref="/gestao/glosas">
        <FiltroInput label="De" name="de" type="date" defaultValue={d.periodo.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={d.periodo.ate} />
        <FiltroSelect label="Convênio" name="convenio" options={convenios} defaultValue={d.convenioId} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={d.hospitalId} />
        <FiltroSelect label="Categoria" name="categoria" options={CATEGORIAS_GLOSA.map((c) => ({ value: c, label: ROTULO_CATEGORIA_GLOSA[c] }))} defaultValue={d.categoria} />
      </Filtros>
      <div className="space-y-3">
        <Table
          titulo="Por categoria (motivo)"
          icone="alerta"
          contagem={d.porCategoria.length}
          acoes={<BotaoCsv href="/gestao/glosas/exportar" params={{ ...params, por: "categoria" }} />}
          head={["Categoria", <span key="v" className="block text-right">Valor</span>, <span key="q" className="block text-right">Glosas</span>, <span key="p" className="block text-right">% do total glosado</span>]}
          empty={d.porCategoria.length === 0}
          emptyText="Nenhuma glosa lançada no período e filtros selecionados."
        >
          {d.porCategoria.map((l) => (
            <tr key={l.categoria}>
              <Td className="font-medium">{ROTULO_CATEGORIA_GLOSA[l.categoria]}</Td>
              <Td className="tnum text-right font-semibold">{money(l.valor)}</Td>
              <Td className="tnum text-right">{num(l.qtd)}</Td>
              <Td className="tnum text-right">{fmtPct(l.pctDoTotal)}</Td>
            </tr>
          ))}
          {d.porCategoria.length > 0 && (
            <tr className="bg-slate-50 font-semibold">
              <Td>Total</Td>
              <Td className="tnum text-right">{money(d.glosado)}</Td>
              <Td className="tnum text-right">{num(d.qtd)}</Td>
              <Td className="tnum text-right">{fmtPct(100)}</Td>
            </tr>
          )}
        </Table>
        {origem("Por convênio", "Convênio", "escudo", d.porConvenio, "convenio")}
        {origem("Por hospital", "Hospital", "predio", d.porHospital, "hospital")}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Situação do recurso de cada glosa fica no detalhe da conta a receber (<StatusBadge status="EM_RECURSO" />, <StatusBadge status="REVERTIDA" />, <StatusBadge status="MANTIDA" />). O convênio vem da cirurgia do pedido de venda; título sem pedido conta em &quot;Sem convênio&quot;.
      </p>
    </>
  );
}
