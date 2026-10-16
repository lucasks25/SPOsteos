import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { date, money, toNumber } from "@/lib/format";
import { tabelaVigente } from "../../_lib/precos";
import { TabelaForm } from "../tabela-form";
import { excluirTabela, incluirTodos, removerPreco, salvarPreco } from "../actions";

export default async function TabelaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const { id } = await params;
  const [t, produtos] = await Promise.all([
    db.tabelaPreco.findUnique({
      where: { id },
      include: { itens: { include: { produto: true }, orderBy: { produto: { descricao: "asc" } } }, hospitais: { select: { id: true, nomeFantasia: true, razaoSocial: true } } },
    }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
  ]);
  if (!t) notFound();
  const edita = user.perfil === "ADMIN" || user.perfil === "COMERCIAL";
  return (
    <>
      <PageHeader
        title={t.nome}
        voltar={{ href: "/comercial/tabelas-preco", label: "Tabelas de preço" }}
        subtitle={`${t.itens.length} produto(s) · hospitais: ${t.hospitais.map((h) => h.nomeFantasia ?? h.razaoSocial).join(", ") || "nenhum"}`}
        actions={
          edita && (
            <>
              <ActionButton action={incluirTodos.bind(null, id)}>Incluir todos pelo preço base</ActionButton>
            </>
          )
        }
        maisAcoes={
          edita && t.hospitais.length === 0 ? (
            <ActionButton action={excluirTabela.bind(null, id)} variant="danger" confirm="Excluir esta tabela?">Excluir</ActionButton>
          ) : undefined
        }
      />
      <KpiGrid cols={3}>
        <Stat icon="etiqueta" label="Produtos com preço" value={t.itens.length} />
        <Stat icon="predio" label="Hospitais vinculados" value={t.hospitais.length} />
        <Stat icon="calendario" label="Vigência" value={<span className="text-base">{t.vigenciaInicio || t.vigenciaFim ? `${date(t.vigenciaInicio)} a ${date(t.vigenciaFim)}` : "sem prazo"}</span>} hint={tabelaVigente(t) ? <span className="text-emerald-700">vigente</span> : <span className="text-amber-700">fora de vigência</span>} />
      </KpiGrid>
      <div className="space-y-4">
        {edita && (
          <Card title="Dados da tabela" icon="etiqueta">
            <TabelaForm tabela={t} />
          </Card>
        )}
        {edita && (
          <Card title="Incluir ou atualizar preço" icon="mais">
            <ItemAdder action={salvarPreco.bind(null, id)} produtos={produtoOptions(produtos)} comPreco comQuantidade={false} label="Salvar preço" />
            <p className="mt-1 text-xs text-slate-600">Se o produto já estiver na tabela, o preço é atualizado.</p>
          </Card>
        )}
        <Table titulo="Preços" icone="etiqueta" contagem={t.itens.length} head={["Produto", "Custo médio", "Preço base", "Preço na tabela", "Margem", ...(edita ? ["Ações"] : [])]} empty={t.itens.length === 0} emptyText="Nenhum preço nesta tabela. Os produtos usam o preço base até serem incluídos." emptyAction={edita ? <ActionButton action={incluirTodos.bind(null, id)}>Incluir todos pelo preço base</ActionButton> : undefined}>
          {t.itens.map((i) => {
            const preco = toNumber(i.preco);
            const custo = toNumber(i.produto.custoMedio);
            const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
            return (
              <tr key={i.id}>
                <Td className="max-w-sm">
                  <Link href={`/cadastros/produtos/${i.produtoId}`} className="block truncate font-medium text-teal-700 hover:underline">{i.produto.descricao}</Link>
                  <div className="font-mono text-xs text-slate-500">{i.produto.codigo}</div>
                </Td>
                <Td className="tnum text-right">{money(custo)}</Td>
                <Td className="tnum text-right">{money(i.produto.precoBase)}</Td>
                <Td className="tnum text-right font-semibold">{money(preco)}</Td>
                <Td className={margem < 20 ? "tnum text-right text-rose-600" : "tnum text-right text-emerald-700"}>{margem.toFixed(1)}%</Td>
                {edita && <Td><ActionButton action={removerPreco.bind(null, i.id)} variant="small">Remover</ActionButton></Td>}
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
