import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ConvenioForm } from "../convenio-form";
import { alternarAtivoConvenio, excluirConvenio } from "../actions";

export default async function EditarConvenioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const convenio = await db.convenio.findUnique({ where: { id }, include: { _count: { select: { cirurgias: true, orcamentos: true } } } });
  if (!convenio) notFound();
  const vinculos = convenio._count.cirurgias + convenio._count.orcamentos;
  return (
    <>
      <PageHeader
        title={convenio.nome}
        subtitle={convenio.registroAns ? `Registro ANS ${convenio.registroAns}` : undefined}
        actions={
          <>
            {!convenio.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoConvenio.bind(null, id)}>{convenio.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {vinculos === 0 && (
              <ActionButton action={excluirConvenio.bind(null, id)} variant="danger" confirm="Excluir este convênio?">
                Excluir
              </ActionButton>
            )}
          </>
        }
      />
      <Card>
        <ConvenioForm key={String(convenio.ativo)} convenio={convenio} />
      </Card>
    </>
  );
}
