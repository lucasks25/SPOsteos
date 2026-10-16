import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_FORNECEDOR } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Badge, Card, PageHeader } from "@/components/ui";
import { VerDocumentos } from "../../_lib/link-documentos";
import { ActionButton } from "@/components/form";
import { podeIrParaDocumentos, podeIrParaFavorecidos } from "../../_lib/permissoes";
import Link from "next/link";
import { FornecedorForm } from "../fornecedor-form";
import { alternarAtivoFornecedor, excluirFornecedor } from "../actions";

export default async function EditarFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_FORNECEDOR);
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
          edita ? (
            <>
            {!fornecedor.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoFornecedor.bind(null, id)}>{fornecedor.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {vinculos === 0 && (
              <ActionButton action={excluirFornecedor.bind(null, id)} variant="danger" confirm="Excluir este fornecedor?">
                Excluir
              </ActionButton>
            )}
          </>
          ) : undefined
        }
      />
      <Card>
        <SomenteLeitura edita={edita} dono="Compras">
          <FornecedorForm key={String(fornecedor.ativo)} fornecedor={fornecedor} />
        </SomenteLeitura>
      </Card>
      {podeIrParaFavorecidos(user.perfil) && (
        <p className="mt-3 text-[13px]">
          <Link href={`/financeiro/favorecidos/${id}`} className="text-teal-700 hover:underline">Dados de pagamento</Link>
        </p>
      )}
      {podeIrParaDocumentos(user.perfil) && <VerDocumentos campo="fornecedorId" id={id} />}
    </>
  );
}
