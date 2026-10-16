import { requireUser } from "@/lib/auth";
import { PERFIS_SUPRIMENTOS } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { FabricanteForm } from "../fabricante-form";

export default async function NovoFabricantePage() {
  await requireUser(PERFIS_SUPRIMENTOS);
  return (
    <>
      <PageHeader title="Novo fabricante" subtitle="Cadastre o fabricante dos materiais; o CNPJ é opcional para estrangeiros." />
      <Card>
        <FabricanteForm />
      </Card>
    </>
  );
}
