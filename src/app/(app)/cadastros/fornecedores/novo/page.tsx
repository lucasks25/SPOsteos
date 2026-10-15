import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { podeDadosBancarios } from "../../_lib/permissoes";
import { FornecedorForm } from "../fornecedor-form";

export default async function NovoFornecedorPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Novo fornecedor" subtitle="Cadastre o fornecedor; a AFE e os dados bancários podem ser completados depois." />
      <Card>
        <FornecedorForm podeBanco={podeDadosBancarios(user.perfil)} />
      </Card>
    </>
  );
}
