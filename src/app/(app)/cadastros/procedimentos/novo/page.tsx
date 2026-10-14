import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ProcedimentoForm } from "../procedimento-form";

export default async function NovoProcedimentoPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo procedimento" subtitle="Depois de criar, inclua os materiais padrão" />
      <Card>
        <ProcedimentoForm />
      </Card>
    </>
  );
}
