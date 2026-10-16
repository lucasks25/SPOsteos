import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DocumentosCard } from "@/app/(app)/qualidade/documentos/documentos-card";
import { Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { FabricanteForm } from "../fabricante-form";
import { excluirFabricante } from "../actions";

export default async function EditarFabricantePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const fabricante = await db.fabricante.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
  if (!fabricante) notFound();
  return (
    <>
      <PageHeader
        title={fabricante.nome}
        subtitle={`${fabricante._count.produtos} produto(s) vinculado(s)`}
        actions={
          fabricante._count.produtos === 0 && (
            <ActionButton action={excluirFabricante.bind(null, id)} variant="danger" confirm="Excluir este fabricante?">
              Excluir
            </ActionButton>
          )
        }
      />
      <Card>
        <FabricanteForm fabricante={fabricante} />
      </Card>
      <DocumentosCard escopo="FABRICANTE" id={id} perfil={user.perfil} />
    </>
  );
}
