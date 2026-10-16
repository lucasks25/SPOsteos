import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Card, PageHeader } from "@/components/ui";
import { VerDocumentos } from "../../_lib/link-documentos";
import { podeAlterarPreco, podeIrParaDocumentos } from "../../_lib/permissoes";
import { ProdutoForm } from "../produto-form";

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_PRODUTO);
  const { id } = await params;
  const [produto, fabricantes] = await Promise.all([
    db.produto.findUnique({ where: { id } }),
    db.fabricante.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!produto) notFound();
  return (
    <>
      <PageHeader title={produto.descricao} subtitle={`Código ${produto.codigo}`} />
      <Card>
        <SomenteLeitura edita={edita} dono="Comercial, Compras, Qualidade ou Estoque">
          <ProdutoForm produto={produto} fabricantes={fabricantes} podePreco={podeAlterarPreco(user.perfil)} />
        </SomenteLeitura>
      </Card>
      {podeIrParaDocumentos(user.perfil) && <VerDocumentos campo="produtoId" id={id} />}
    </>
  );
}
