import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { TIPOS } from "../../_lib/config";
import { listarParceiros } from "../../_lib/queries";
import { TituloForm } from "../../_lib/titulo-form";

export default async function Page() {
  await requireUser(["FINANCEIRO"]);
  const parceiros = await listarParceiros("receber");
  return (
    <>
      <PageHeader title={`Novo título — ${TIPOS.receber.singular.toLowerCase()}`} />
      <Card>
        <TituloForm tipo="receber" parceiros={parceiros} />
      </Card>
    </>
  );
}
