import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { opcoesCirurgia } from "@/app/(app)/cadastros/_lib/publico";
import { CirurgiaForm } from "../cirurgia-form";

export default async function NovaCirurgiaPage() {
  await requireUser(["COMERCIAL"]);
  const opcoes = await opcoesCirurgia();
  return (
    <>
      <PageHeader title="Nova cirurgia" subtitle="O Comercial cadastra a cirurgia. Depois de salvar, o Estoque separa o material e gera o vale de consignação." />
      <Card title="Dados" icon="documento">
        <CirurgiaForm opcoes={opcoes} />
      </Card>
    </>
  );
}
