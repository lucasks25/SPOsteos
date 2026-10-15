import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { podeDadosBancarios } from "../../_lib/permissoes";
import { FornecedorForm } from "../fornecedor-form";

export default async function NovoFornecedorPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Novo fornecedor" />
      <Card>
        <FornecedorForm podeBanco={podeDadosBancarios(user.perfil)} />
      </Card>
    </>
  );
}
