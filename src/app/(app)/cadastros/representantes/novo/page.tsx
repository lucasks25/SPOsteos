import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { RepresentanteForm } from "../representante-form";

export default async function NovoRepresentantePage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo representante" />
      <Card>
        <RepresentanteForm />
      </Card>
    </>
  );
}
