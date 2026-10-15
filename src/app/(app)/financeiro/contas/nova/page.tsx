import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ContaForm } from "../conta-form";

export default async function NovaContaPage() {
  await requireUser(["FINANCEIRO"]);
  return (
    <>
      <PageHeader title="Nova conta" subtitle="Cadastre um banco ou caixa. Para pagar e cobrar pelo Itaú, preencha agência, conta e titular." />
      <Card>
        <ContaForm />
      </Card>
    </>
  );
}
