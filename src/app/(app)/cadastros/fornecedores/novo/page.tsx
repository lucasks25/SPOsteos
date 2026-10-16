import { requireUser } from "@/lib/auth";
import { PERFIS_FORNECEDOR } from "../../_lib/acoes";
import { Card, PageHeader } from "@/components/ui";
import { FornecedorForm } from "../fornecedor-form";

export default async function NovoFornecedorPage() {
  await requireUser(PERFIS_FORNECEDOR);
  return (
    <>
      <PageHeader title="Novo fornecedor" subtitle="Cadastre o fornecedor; a AFE pode ser completada depois. Dados de pagamento ficam em Financeiro > Favorecidos." />
      <Card>
        <FornecedorForm />
      </Card>
    </>
  );
}
