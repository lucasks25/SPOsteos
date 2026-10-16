import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { ConvenioForm } from "../convenio-form";

export default async function NovoConvenioPage() {
  await requireUser(PERFIS_COMERCIAL);
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/convenios", label: "Convênios" }} title="Novo convênio" subtitle="Cadastre a operadora de plano de saúde com registro ANS e CNPJ." />
      <Card>
        <ConvenioForm />
      </Card>
    </>
  );
}
