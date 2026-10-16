import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { MedicoForm } from "../medico-form";

export default async function NovoMedicoPage() {
  await requireUser(PERFIS_COMERCIAL);
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/medicos", label: "Médicos" }} title="Novo médico" subtitle="Cadastre o cirurgião ou solicitante com CRM e contato." />
      <Card>
        <MedicoForm />
      </Card>
    </>
  );
}
