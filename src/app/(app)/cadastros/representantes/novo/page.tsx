import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { RepresentanteForm } from "../representante-form";

export default async function NovoRepresentantePage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo representante" subtitle="Cadastre o representante comercial e o percentual de comissão." />
      <Card>
        <RepresentanteForm />
      </Card>
    </>
  );
}
