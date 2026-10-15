import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../../_lib/perfis";
import { KitForm } from "../kit-form";
import { adicionarItemKit, excluirKit, removerItemKit } from "../actions";

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER);
  const { id } = await params;
  const [kit, produtos, disponivel] = await Promise.all([
    db.kit.findUnique({ where: { id }, include: { itens: { include: { produto: true }, orderBy: { produto: { descricao: "asc" } } }, _count: { select: { remessas: true } } } }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    db.saldo.groupBy({ by: ["produtoId"], where: { localId: "local-deposito", quantidade: { gt: 0 }, lote: { status: "LIBERADO", validade: { gte: new Date() } } }, _sum: { quantidade: true } }),
  ]);
  if (!kit) notFound();
  const disp = new Map(disponivel.map((d) => [d.produtoId, d._sum.quantidade ?? 0]));
  const edita = podeEditar(user.perfil);
  const montaveis = kit.itens.length ? Math.min(...kit.itens.map((i) => Math.floor((disp.get(i.produtoId) ?? 0) / i.quantidade))) : 0;
  return (
    <>
      <PageHeader
        title={`${kit.codigo} — ${kit.descricao}`}
        subtitle={`${kit._count.remessas} remessa(s) · ${montaveis} kit(s) completo(s) disponíveis no depósito`}
        actions={
          edita && kit._count.remessas === 0 && (
            <ActionButton action={excluirKit.bind(null, id)} variant="danger" confirm="Excluir este kit?">Excluir</ActionButton>
          )
        }
      />
      <div className="space-y-6">
        {edita && (
          <Card title="Dados do kit">
            <KitForm kit={kit} />
          </Card>
        )}
        <Card title="Itens do kit">
          {edita && (
            <div className="mb-4">
              <ItemAdder action={adicionarItemKit.bind(null, id)} produtos={produtoOptions(produtos)} />
            </div>
          )}
          <Table head={["Código", "Produto", "Qtd. no kit", "Disponível no depósito", "Ações"]} empty={kit.itens.length === 0} emptyText="Este kit ainda não tem itens. Use o campo acima para incluir produtos.">
            {kit.itens.map((i) => {
              const d = disp.get(i.produtoId) ?? 0;
              return (
                <tr key={i.id}>
                  <Td className="font-mono text-xs">{i.produto.codigo}</Td>
                  <Td>{i.produto.descricao}</Td>
                  <Td className="text-right">{i.quantidade}</Td>
                  <Td className={d < i.quantidade ? "text-right text-rose-600" : "text-right"}>{num(d)}</Td>
                  <Td>{edita && <ActionButton action={removerItemKit.bind(null, i.id)} variant="small">Remover</ActionButton>}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
