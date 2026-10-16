import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { LinhaForm } from "../linha-form";

export default async function NovaLinhaPage() {
  await requireUser(PERFIS_PRODUTO);
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/linhas", label: "Linhas de produto" }} title="Nova linha" subtitle="Agrupa produtos para acompanhar vendas, margem e comissão por linha." />
      <Card>
        <LinhaForm />
      </Card>
    </>
  );
}
