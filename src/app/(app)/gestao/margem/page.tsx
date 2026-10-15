import { Celula } from "../../financeiro/_lib/visual";
import { KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "../../comercial/_components/filtros";
import { opcoesHospitais, opcoesRepresentantes } from "../../comercial/_lib/opcoes";
import { margemDados, type SP } from "../_lib/consultas";
import type { LinhaMargem } from "../_lib/margens";
import { ThOrdenavel, ordenar, parseOrdem } from "../_lib/ordenar";
import { BotaoCsv, fmtPct, PERFIS_GESTAO } from "../_lib/visual";

const COLUNAS = ["nome", "pedidos", "quantidade", "receita", "custo", "margem", "margemPct", "comissao"] as const;
const PADRAO = { campo: "receita", dir: "desc" as const };
const ACESSORES = {
  nome: (l: LinhaMargem) => l.nome,
  pedidos: (l: LinhaMargem) => l.pedidos,
  quantidade: (l: LinhaMargem) => l.quantidade,
  receita: (l: LinhaMargem) => l.receita,
  custo: (l: LinhaMargem) => l.custo,
  margem: (l: LinhaMargem) => l.margem,
  margemPct: (l: LinhaMargem) => l.margemPct,
  comissao: (l: LinhaMargem) => l.comissao,
};

export default async function MargemPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = await searchParams;
  const [d, hospitais, representantes] = await Promise.all([margemDados(sp), opcoesHospitais(false), opcoesRepresentantes(false)]);
  const params = { de: d.periodo.de, ate: d.periodo.ate, hospital: d.hospitalId, representante: d.representanteId };

  const tabela = (por: "produto" | "hospital" | "representante", titulo: string, rotulo: string, icone: "pacote" | "predio" | "usuarios", linhasBrutas: LinhaMargem[], param: string) => {
    const ordem = parseOrdem(sp[param], COLUNAS, PADRAO);
    const linhas = ordenar(linhasBrutas, ordem, ACESSORES);
    const th = (campo: string, texto: string, numerico = true) => (
      <ThOrdenavel key={campo} base="/gestao/margem" sp={sp} param={param} campo={campo} atual={ordem} numerico={numerico}>{texto}</ThOrdenavel>
    );
    return (
      <Table
        titulo={titulo}
        icone={icone}
        contagem={linhas.length}
        acoes={<BotaoCsv href="/gestao/margem/exportar" params={{ ...params, por }} />}
        head={[th("nome", rotulo, false), th("pedidos", "Pedidos"), th("quantidade", "Quantidade"), th("receita", "Receita"), th("custo", "Custo"), th("margem", "Margem (R$)"), th("margemPct", "Margem %"), th("comissao", "Comissão")]}
        empty={linhas.length === 0}
        emptyText="Nenhum pedido de venda faturado no período e filtros selecionados."
      >
        {linhas.map((l) => (
          <tr key={l.id}>
            <Td className="max-w-[24rem]"><Celula principal={l.nome} sub={l.sub || undefined} /></Td>
            <Td className="tnum text-right">{num(l.pedidos)}</Td>
            <Td className="tnum text-right">{num(l.quantidade)}</Td>
            <Td className="tnum text-right">{money(l.receita)}</Td>
            <Td className="tnum text-right">{money(l.custo)}</Td>
            <Td className={`tnum text-right font-semibold ${l.margem < 0 ? "text-rose-600" : ""}`}>{money(l.margem)}</Td>
            <Td className={`tnum text-right ${l.margem < 0 ? "text-rose-600" : ""}`}>{fmtPct(l.margemPct)}</Td>
            <Td className="tnum text-right">{money(l.comissao)}</Td>
          </tr>
        ))}
      </Table>
    );
  };

  const t = d.total;
  return (
    <>
      <PageHeader title="Margem de contribuição" subtitle="Pedidos faturados no período (data da NF). Custo = custo médio congelado em cada item na hora do faturamento. Clique no título de uma coluna para ordenar." />
      <KpiGrid cols={5}>
        <Stat label="Receita" value={money(t.receita)} hint={`${num(t.pedidos)} pedido(s)`} />
        <Stat label="Custo" value={money(t.custo)} />
        <Stat label="Margem" value={money(t.margem)} tone={t.margem < 0 ? "danger" : "default"} />
        <Stat label="Margem %" value={fmtPct(t.margemPct)} tone={t.margem < 0 ? "danger" : "default"} />
        <Stat label="Comissões" value={money(t.comissao)} hint={t.receita > 0 ? `${fmtPct((t.comissao / t.receita) * 100)} da receita` : undefined} />
      </KpiGrid>
      <Filtros limparHref="/gestao/margem">
        <FiltroInput label="De" name="de" type="date" defaultValue={d.periodo.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={d.periodo.ate} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={d.hospitalId} />
        <FiltroSelect label="Representante" name="representante" options={representantes} defaultValue={d.representanteId} />
      </Filtros>
      <div className="space-y-3">
        {tabela("produto", "Margem por produto", "Produto", "pacote", d.produtos, "op")}
        {tabela("hospital", "Margem por hospital", "Hospital", "predio", d.hospitais, "oh")}
        {tabela("representante", "Margem por representante", "Representante", "usuarios", d.representantes, "or")}
      </div>
      <p className="mt-2 text-xs text-slate-500">Na tabela por produto, a comissão do pedido é rateada entre os itens pela receita de cada um.</p>
    </>
  );
}
