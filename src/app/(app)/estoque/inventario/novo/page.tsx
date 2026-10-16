import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Form, Select, TextArea } from "@/components/form";
import { PERFIS_EDITAR } from "../../_lib/perfis";
import { criarInventarioAction } from "../actions";

export default async function NovoInventarioPage() {
  await requireUser(PERFIS_EDITAR);
  const hospitais = await db.hospital.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } });
  return (
    <>
      <PageHeader title="Novo inventário de consignado" subtitle="Registra o saldo atual do hospital para você contar o material. Os movimentos feitos depois da foto são avisados no fechamento." />
      <Card title="Hospital" icon="predio">
        <Form action={criarInventarioAction} submitLabel="Criar inventário">
          <Select label="Hospital *" name="hospitalId" required options={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))} />
          <TextArea label="Observação" name="observacao" maxLength={500} />
        </Form>
      </Card>
    </>
  );
}
