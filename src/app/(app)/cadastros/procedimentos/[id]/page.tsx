import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { ProcedimentoForm } from "../procedimento-form";
import { adicionarItem, excluirProcedimento, removerItem } from "../actions";

export default async function EditarProcedimentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [proc, produtos] = await Promise.all([
    db.procedimento.findUnique({
      where: { id },
      include: { itens: { include: { produto: true }, orderBy: { produto: { descricao: "asc" } } }, _count: { select: { cirurgias: true } } },
    }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
  ]);
  if (!proc) notFound();
  return (
    <>
      <PageHeader
        title={proc.descricao}
        subtitle={`${proc.codigoTuss ? `TUSS ${proc.codigoTuss} · ` : ""}${proc._count.cirurgias} cirurgia(s)`}
        actions={
          proc._count.cirurgias === 0 && (
            <ActionButton action={excluirProcedimento.bind(null, id)} variant="danger" confirm="Excluir este procedimento?">
              Excluir
            </ActionButton>
          )
        }
      />
      <div className="space-y-6">
        <Card title="Dados do procedimento">
          <ProcedimentoForm proc={proc} />
        </Card>
        <Card title="Materiais padrão (sugeridos na remessa da cirurgia)">
          <div className="mb-4">
            <ItemAdder action={adicionarItem.bind(null, id)} produtos={produtoOptions(produtos)} />
          </div>
          <Table head={["Código", "Produto", "Qtd.", ""]} empty={proc.itens.length === 0}>
            {proc.itens.map((i) => (
              <tr key={i.id}>
                <Td className="font-mono text-xs">{i.produto.codigo}</Td>
                <Td>{i.produto.descricao}</Td>
                <Td>{i.quantidade}</Td>
                <Td>
                  <ActionButton action={removerItem.bind(null, i.id)} variant="ghost">
                    Remover
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
