import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { TabelaForm } from "../tabela-form";

export default async function NovaTabelaPage() {
  await requireUser(["COMERCIAL"]);
  return (
    <>
      <PageHeader title="Nova tabela de preço" subtitle="O Comercial define o nome e os hospitais; depois de criar, inclua os preços por produto." />
      <Card>
        <TabelaForm />
      </Card>
    </>
  );
}
