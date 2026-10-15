import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { MedicoForm } from "../medico-form";

export default async function NovoMedicoPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo médico" subtitle="Cadastre o cirurgião ou solicitante com CRM e contato." />
      <Card>
        <MedicoForm />
      </Card>
    </>
  );
}
