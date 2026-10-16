import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_HOSPITAL } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { HospitalForm } from "../hospital-form";

export default async function NovoHospitalPage() {
  await requireUser(PERFIS_HOSPITAL);
  const tabelas = await db.tabelaPreco.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  return (
    <>
      <PageHeader title="Novo hospital" subtitle="Um local de estoque consignado será criado automaticamente." />
      <Card>
        <HospitalForm tabelas={tabelas} />
      </Card>
    </>
  );
}
