import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { FornecedorForm } from "../fornecedor-form";

export default async function NovoFornecedorPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo fornecedor" />
      <Card>
        <FornecedorForm />
      </Card>
    </>
  );
}
