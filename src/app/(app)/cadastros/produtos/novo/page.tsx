import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { podeAlterarPreco } from "../../_lib/permissoes";
import { ProdutoForm } from "../produto-form";

export default async function NovoProdutoPage() {
  const user = await requireUser(PERFIS_PRODUTO);
  const fabricantes = await db.fabricante.findMany({ orderBy: { nome: "asc" } });
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/produtos", label: "Produtos" }} title="Novo produto" subtitle="Cadastre o material com registro ANVISA, fabricante e estoque mínimo." />
      <Card>
        <ProdutoForm fabricantes={fabricantes} podePreco={podeAlterarPreco(user.perfil)} />
      </Card>
    </>
  );
}
