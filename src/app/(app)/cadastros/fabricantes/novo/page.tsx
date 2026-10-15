import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { FabricanteForm } from "../fabricante-form";

export default async function NovoFabricantePage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo fabricante" subtitle="Cadastre o fabricante dos materiais; o CNPJ é opcional para estrangeiros." />
      <Card>
        <FabricanteForm />
      </Card>
    </>
  );
}
