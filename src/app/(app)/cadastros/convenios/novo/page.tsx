import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ConvenioForm } from "../convenio-form";

export default async function NovoConvenioPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo convênio" />
      <Card>
        <ConvenioForm />
      </Card>
    </>
  );
}
