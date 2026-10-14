import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { FabricanteForm } from "../fabricante-form";

export default async function NovoFabricantePage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo fabricante" />
      <Card>
        <FabricanteForm />
      </Card>
    </>
  );
}
