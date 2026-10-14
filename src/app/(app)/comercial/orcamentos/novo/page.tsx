import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { opcoesConvenios, opcoesHospitais } from "../../_lib/opcoes";
import { OrcamentoForm } from "../orcamento-form";

export default async function NovoOrcamentoPage() {
  await requireUser(["COMERCIAL"]);
  const [hospitais, convenios] = await Promise.all([opcoesHospitais(), opcoesConvenios()]);
  return (
    <>
      <PageHeader title="Novo orçamento" subtitle="Depois de criar, inclua os itens" />
      <Card>
        <OrcamentoForm hospitais={hospitais} convenios={convenios} />
      </Card>
    </>
  );
}
