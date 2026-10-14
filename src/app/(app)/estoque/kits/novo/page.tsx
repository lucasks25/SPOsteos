import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PERFIS_EDITAR } from "../../_lib/perfis";
import { KitForm } from "../kit-form";

export default async function NovoKitPage() {
  await requireUser(PERFIS_EDITAR);
  return (
    <>
      <PageHeader title="Novo kit" subtitle="Depois de criar, inclua os itens" />
      <Card>
        <KitForm />
      </Card>
    </>
  );
}
