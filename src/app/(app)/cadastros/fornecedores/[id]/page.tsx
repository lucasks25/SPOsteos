import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { FornecedorForm } from "../fornecedor-form";
import { alternarAtivoFornecedor, excluirFornecedor } from "../actions";

export default async function EditarFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fornecedor = await db.fornecedor.findUnique({
    where: { id },
    include: { _count: { select: { pedidos: true, contasPagar: true } } },
  });
  if (!fornecedor) notFound();
  const vinculos = fornecedor._count.pedidos + fornecedor._count.contasPagar;
  return (
    <>
      <PageHeader
        title={fornecedor.nomeFantasia ?? fornecedor.razaoSocial}
        subtitle={`CNPJ ${fornecedor.cnpj} · ${fornecedor._count.pedidos} pedido(s) de compra`}
        actions={
          <>
            {!fornecedor.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoFornecedor.bind(null, id)}>{fornecedor.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {vinculos === 0 && (
              <ActionButton action={excluirFornecedor.bind(null, id)} variant="danger" confirm="Excluir este fornecedor?">
                Excluir
              </ActionButton>
            )}
          </>
        }
      />
      <Card>
        <FornecedorForm key={String(fornecedor.ativo)} fornecedor={fornecedor} />
      </Card>
    </>
  );
}
