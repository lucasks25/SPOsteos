import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { money, toNumber } from "@/lib/format";
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
        subtitle={`${t.itens.length} produto(s) · hospitais: ${t.hospitais.map((h) => h.nomeFantasia ?? h.razaoSocial).join(", ") || "nenhum"}`}
        actions={
          edita && (
            <>
              <ActionButton action={incluirTodos.bind(null, id)}>Incluir todos pelo preço base</ActionButton>
              {t.hospitais.length === 0 && (
                <ActionButton action={excluirTabela.bind(null, id)} variant="danger" confirm="Excluir esta tabela?">Excluir</ActionButton>
              )}
            </>
          )
        }
      />
      <div className="space-y-6">
        {edita && (
          <Card title="Dados da tabela">
            <TabelaForm tabela={t} />
          </Card>
        )}
        <Card title="Preços">
          {edita && (
            <div className="mb-4">
              <ItemAdder action={salvarPreco.bind(null, id)} produtos={produtoOptions(produtos)} comPreco comQuantidade={false} label="Salvar preço" />
              <p className="mt-1 text-xs text-slate-400">Se o produto já estiver na tabela, o preço é atualizado.</p>
            </div>
          )}
          <Table head={["Código", "Produto", "Custo médio", "Preço base", "Preço na tabela", "Margem", ""]} empty={t.itens.length === 0}>
            {t.itens.map((i) => {
              const preco = toNumber(i.preco);
              const custo = toNumber(i.produto.custoMedio);
              const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
              return (
                <tr key={i.id}>
                  <Td className="font-mono text-xs">
                    <Link href={`/cadastros/produtos/${i.produtoId}`} className="hover:underline">{i.produto.codigo}</Link>
                  </Td>
                  <Td className="max-w-sm truncate">{i.produto.descricao}</Td>
                  <Td>{money(custo)}</Td>
                  <Td>{money(i.produto.precoBase)}</Td>
                  <Td className="font-semibold">{money(preco)}</Td>
                  <Td className={margem < 20 ? "text-rose-600" : "text-emerald-700"}>{margem.toFixed(1)}%</Td>
                  <Td>{edita && <ActionButton action={removerPreco.bind(null, i.id)} variant="ghost">Remover</ActionButton>}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
