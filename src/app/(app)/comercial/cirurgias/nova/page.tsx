import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { opcoesCirurgia } from "../../_lib/opcoes";
import { CirurgiaForm } from "../cirurgia-form";

export default async function NovaCirurgiaPage() {
  await requireUser(["COMERCIAL"]);
  const opcoes = await opcoesCirurgia();
  return (
    <>
      <PageHeader title="Nova cirurgia" subtitle="Preencha os dados do procedimento. Depois de salvar, gere a remessa/vale de consignação." />
      <Card>
        <CirurgiaForm opcoes={opcoes} />
      </Card>
    </>
  );
}
