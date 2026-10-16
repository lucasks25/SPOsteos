import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { opcoesCirurgia } from "@/app/(app)/cadastros/_lib/publico";
import { CirurgiaForm } from "../../cirurgia-form";

export default async function EditarCirurgiaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["COMERCIAL"]);
  const { id } = await params;
  const [cirurgia, opcoes] = await Promise.all([db.cirurgia.findUnique({ where: { id } }), opcoesCirurgia(false)]);
  if (!cirurgia) notFound();
  const bloqueada = cirurgia.status === "FATURADA" || cirurgia.status === "CANCELADA";
  return (
    <>
      <PageHeader
        title={`Editar cirurgia CIR-${cirurgia.numero}`}
        subtitle={`Comercial: corrija os dados do agendamento de ${cirurgia.paciente}.`}
        actions={<LinkButton href={`/comercial/cirurgias/${id}`} variant="secondary">Voltar</LinkButton>}
      />
      <Card>
        {bloqueada ? (
          <p className="text-sm text-slate-600">Cirurgia {cirurgia.status.toLowerCase()} não pode ser editada. Volte para a cirurgia para consultar os dados.</p>
        ) : (
          <CirurgiaForm cirurgia={cirurgia} opcoes={opcoes} />
        )}
      </Card>
    </>
  );
}
