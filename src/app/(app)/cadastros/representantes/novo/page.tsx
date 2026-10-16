import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { RepresentanteForm } from "../representante-form";

export default async function NovoRepresentantePage() {
  await requireUser(PERFIS_COMERCIAL);
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/representantes", label: "Representantes" }} title="Novo representante" subtitle="Cadastre o representante comercial e o percentual de comissão." />
      <Card>
        <RepresentanteForm />
      </Card>
    </>
  );
}
