import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { RepresentanteForm } from "../representante-form";

export default async function EditarRepresentantePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const rep = await db.representante.findUnique({ where: { id } });
  if (!rep) notFound();
  return (
    <>
      <PageHeader title={rep.nome} subtitle="Representante comercial" />
      <Card>
        <RepresentanteForm rep={rep} />
      </Card>
    </>
  );
}
