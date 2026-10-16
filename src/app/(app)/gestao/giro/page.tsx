import { Celula } from "@/components/lista";
import { KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money, num } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "@/components/filtros";
import { giroDados, type SP } from "../_lib/consultas";
import { DIAS_CONSUMO, DIAS_EXCESSO, DIAS_SEM_MOVIMENTO, ROTULO_SITUACAO, type SituacaoGiro } from "../_lib/giro";
import { ThOrdenavel, ordenar, parseOrdem } from "../_lib/ordenar";
import { BadgeSituacao, BotaoCsv, PERFIS_GESTAO } from "../_lib/visual";

const COLUNAS = ["nome", "disponivel", "quarentena", "consumo", "cobertura", "giro", "valor", "sem"] as const;
const PADRAO = { campo: "situacao", dir: "asc" as const };
const PESO: Record<SituacaoGiro, number> = { RUPTURA: 0, EXCESSO: 1, SEM_MOVIMENTO: 2, OK: 3 };

export default async function GiroPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = await searchParams;
  const d = await giroDados(sp);
  const ordem = parseOrdem(sp.o, [...COLUNAS, "situacao"], PADRAO);
  const linhas = ordenar(
    [...d.linhas].sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || a.nome.localeCompare(b.nome, "pt-BR")),
    ordem,
    {
      situacao: (l) => PESO[l.situacao],
      nome: (l) => l.nome,
      disponivel: (l) => l.disponivel,
      quarentena: (l) => l.quarentena,
      consumo: (l) => l.consumo,
      cobertura: (l) => l.cobertura,
      giro: (l) => l.giro,
      valor: (l) => l.valor,
      sem: (l) => l.diasSemMovimento ?? 99999,
    },
  );
  const th = (campo: string, rotulo: string, numerico = true) => (
    <ThOrdenavel key={campo} base="/gestao/giro" sp={sp} param="o" campo={campo} atual={ordem} numerico={numerico}>{rotulo}</ThOrdenavel>
  );
  const mostrar = (n: number) => (n === 0 ? "—" : num(n));
  return (
    <>
      <PageHeader
        title="Giro e cobertura de estoque"
        subtitle={`Relatório de leitura: por quantos dias o estoque dura. Disponível = depósito + consignado. Consumo dos últimos ${DIAS_CONSUMO} dias em cirurgia. Cobertura = disponível ÷ consumo por dia. Giro anual = consumo anualizado ÷ disponível.`}
      />
      <KpiGrid cols={5}>
        <Stat label="Produtos acompanhados" value={num(d.todas)} hint={`valor em estoque ${money(d.valorTotal)}`} icon="pacote" />
        <Stat label="Ruptura" value={num(d.ruptura.length)} tone={d.ruptura.length ? "danger" : "default"} hint={`cobertura < ${d.prazo} dias, abaixo do mínimo ou sem estoque`} icon="alerta" />
        <Stat label="Excesso" value={num(d.excesso.length)} tone={d.excesso.length ? "warn" : "default"} hint={`cobertura > ${DIAS_EXCESSO} dias`} icon="camadas" />
        <Stat label="Sem movimento" value={num(d.semMovimento.length)} tone={d.semMovimento.length ? "warn" : "default"} hint={`sem consumo há ${DIAS_SEM_MOVIMENTO}+ dias`} icon="calendario" />
        <Stat label="Parado (excesso + sem mov.)" value={money(d.valorExcesso)} hint="valor ao custo médio" icon="pagar" />
      </KpiGrid>
      <Filtros limparHref="/gestao/giro">
        <FiltroSelect label="Situação" name="situacao" options={(Object.keys(ROTULO_SITUACAO) as SituacaoGiro[]).map((s) => ({ value: s, label: ROTULO_SITUACAO[s] }))} defaultValue={d.situacao} />
        <FiltroInput label="Prazo de reposição (dias)" name="prazo" type="number" defaultValue={String(d.prazo)} className="w-40" />
      </Filtros>
      <Table
        titulo="Produtos"
        icone="pacote"
        contagem={linhas.length}
        acoes={<BotaoCsv href="/gestao/giro/exportar" params={{ situacao: d.situacao, prazo: String(d.prazo) }} />}
        head={[
          th("nome", "Produto", false),
          th("disponivel", "Disponível"),
          <span key="dep" className="block text-right">Depósito / consig.</span>,
          th("quarentena", "Quarentena"),
          <span key="min" className="block text-right">Mínimo</span>,
          th("consumo", `Consumo ${DIAS_CONSUMO}d`),
          th("cobertura", "Cobertura (dias)"),
          th("giro", "Giro/ano"),
          th("sem", "Último consumo"),
          th("valor", "Valor"),
          th("situacao", "Situação", false),
        ]}
        empty={linhas.length === 0}
        emptyText="Nenhum produto com estoque ou consumo para os filtros selecionados."
      >
        {linhas.map((l) => (
          <tr key={l.id}>
            <Td className="max-w-[22rem]"><Celula principal={l.nome} sub={l.codigo} /></Td>
            <Td className="tnum text-right font-semibold">{num(l.disponivel)}</Td>
            <Td className="tnum text-right text-slate-600">{num(l.deposito)} / {num(l.consignado)}</Td>
            <Td className="tnum text-right">{mostrar(l.quarentena)}</Td>
            <Td className="tnum text-right">{mostrar(l.estoqueMinimo)}</Td>
            <Td className="tnum text-right">{mostrar(l.consumo)}</Td>
            <Td className="tnum text-right">{l.cobertura === null ? "—" : num(l.cobertura)}</Td>
            <Td className="tnum text-right">{l.giro === null ? "—" : num(l.giro)}</Td>
            <Td className="tnum text-right">{l.diasSemMovimento === null ? "nunca" : `${num(l.diasSemMovimento)} d`}</Td>
            <Td className="tnum text-right">{money(l.valor)}</Td>
            <Td><BadgeSituacao situacao={l.situacao} /></Td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-slate-500">Quarentena e não conforme não entram no disponível. Posição de estoque de hoje ({date(new Date())}).</p>
    </>
  );
}
