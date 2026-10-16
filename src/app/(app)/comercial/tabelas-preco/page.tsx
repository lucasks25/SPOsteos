import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, KpiGrid, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { date, num } from "@/lib/format";
import { tabelaVigente } from "../_lib/precos";

export default async function TabelasPage() {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const tabelas = await db.tabelaPreco.findMany({ include: { _count: { select: { itens: true, hospitais: true } } }, orderBy: { nome: "asc" } });
  const vigentes = tabelas.filter((t) => tabelaVigente(t)).length;
  const semHospital = tabelas.filter((t) => t._count.hospitais === 0).length;
  return (
    <>
      <PageHeader title="Tabelas de preço" subtitle="Preço de venda por hospital, mantido pelo Comercial. Sem item na tabela, vale o preço base do produto." actions={<LinkButton href="/comercial/tabelas-preco/nova" icon="mais">Nova tabela</LinkButton>} />
      <KpiGrid cols={3}>
        <Stat label="Tabelas" value={num(tabelas.length)} />
        <Stat label="Vigentes" value={num(vigentes)} hint={<span className="text-emerald-700">em uso hoje</span>} />
        <Stat label="Sem hospital vinculado" value={num(semHospital)} hint={<span className={semHospital ? "text-amber-700" : undefined}>{semHospital ? "podem ser excluídas" : "todas em uso"}</span>} tone={semHospital ? "warn" : "default"} />
      </KpiGrid>
      <Table titulo="Tabelas de preço" icone="etiqueta" contagem={tabelas.length} head={["Tabela", "Vigência", "Situação", "Produtos", "Hospitais", "Ações"]} empty={tabelas.length === 0} emptyText="Nenhuma tabela de preço cadastrada. Sem tabela, vale o preço base do produto." emptyAction={<LinkButton href="/comercial/tabelas-preco/nova" variant="secondary">Nova tabela</LinkButton>}>
        {tabelas.map((t) => (
          <tr key={t.id}>
            <Td>
              <Link href={`/comercial/tabelas-preco/${t.id}`} className="font-medium text-teal-700 hover:underline">{t.nome}</Link>
              <div className="text-xs text-slate-500">{t._count.itens} produto(s) com preço próprio</div>
            </Td>
            <Td>{t.vigenciaInicio || t.vigenciaFim ? `${date(t.vigenciaInicio)} a ${date(t.vigenciaFim)}` : "sem prazo"}</Td>
            <Td>{tabelaVigente(t) ? <Badge color="green">vigente</Badge> : <Badge>fora de vigência</Badge>}</Td>
            <Td className="tnum text-right">{num(t._count.itens)}</Td>
            <Td className="tnum text-right">{num(t._count.hospitais)}</Td>
            <Td><LinkButton href={`/comercial/tabelas-preco/${t.id}`} variant="small">Abrir</LinkButton></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
