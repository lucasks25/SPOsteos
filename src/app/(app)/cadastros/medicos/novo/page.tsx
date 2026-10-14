import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { MedicoForm } from "../medico-form";

export default async function NovoMedicoPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo médico" />
      <Card>
        <MedicoForm />
      </Card>
    </>
  );
}
