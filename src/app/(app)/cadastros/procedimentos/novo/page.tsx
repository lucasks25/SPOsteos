import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { ProcedimentoForm } from "../procedimento-form";

export default async function NovoProcedimentoPage() {
  await requireUser(PERFIS_COMERCIAL);
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/procedimentos", label: "Procedimentos" }} title="Novo procedimento" subtitle="Descreva o procedimento; depois de criar, inclua os materiais padrão." />
      <Card>
        <ProcedimentoForm />
      </Card>
    </>
  );
}
