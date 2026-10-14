import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ProdutoForm } from "../produto-form";

export default async function NovoProdutoPage() {
  await requireUser();
  const fabricantes = await db.fabricante.findMany({ orderBy: { nome: "asc" } });
  return (
    <>
      <PageHeader title="Novo produto" />
      <Card>
        <ProdutoForm fabricantes={fabricantes} />
      </Card>
    </>
  );
}
