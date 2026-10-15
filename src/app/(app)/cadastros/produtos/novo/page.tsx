import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { podeAlterarPreco } from "../../_lib/permissoes";
import { ProdutoForm } from "../produto-form";

export default async function NovoProdutoPage() {
  const user = await requireUser();
  const fabricantes = await db.fabricante.findMany({ orderBy: { nome: "asc" } });
  return (
    <>
      <PageHeader title="Novo produto" subtitle="Cadastre o material com registro ANVISA, fabricante e estoque mínimo." />
      <Card>
        <ProdutoForm fabricantes={fabricantes} podePreco={podeAlterarPreco(user.perfil)} />
      </Card>
    </>
  );
}
