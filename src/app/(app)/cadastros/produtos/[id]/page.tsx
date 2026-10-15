import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { podeAlterarPreco } from "../../_lib/permissoes";
import { ProdutoForm } from "../produto-form";

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
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
        <ProdutoForm produto={produto} fabricantes={fabricantes} podePreco={podeAlterarPreco(user.perfil)} />
      </Card>
    </>
  );
}
