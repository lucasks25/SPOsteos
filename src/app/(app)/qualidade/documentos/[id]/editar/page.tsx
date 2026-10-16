import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { inputDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { PERFIS_EDITAR_DOCUMENTOS, ROTULO_ESCOPO, ROTULO_TIPO } from "../../../_lib/documentos";
import { DocumentoEditarForm } from "../../documento-form";

export default async function EditarDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  const { id } = await params;
  const d = await db.documento.findUnique({ where: { id } });
  if (!d) notFound();
  return (
    <>
      <PageHeader title={`Editar: ${d.titulo}`} subtitle={`${ROTULO_TIPO[d.tipo]} · ${ROTULO_ESCOPO[d.escopo]}. Tipo e vínculo não mudam; para outro vínculo, cadastre um novo documento.`} />
      <Card title="Dados do documento">
        <DocumentoEditarForm d={{ id: d.id, tipo: d.tipo, titulo: d.titulo, numero: d.numero ?? "", orgaoEmissor: d.orgaoEmissor ?? "", emissao: inputDate(d.emissao), validade: inputDate(d.validade), observacao: d.observacao ?? "" }} />
      </Card>
    </>
  );
}
