import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { MedicoForm } from "../medico-form";
import { alternarAtivoMedico, excluirMedico } from "../actions";

export default async function EditarMedicoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_COMERCIAL);
  const { id } = await params;
  const medico = await db.medico.findUnique({ where: { id }, include: { _count: { select: { cirurgias: true } } } });
  if (!medico) notFound();
  return (
    <>
      <PageHeader
        voltar={{ href: "/cadastros/medicos", label: "Médicos" }}
        title={medico.nome}
        subtitle={`CRM ${medico.crm}/${medico.ufCrm} · ${medico._count.cirurgias} cirurgia(s)`}
        actions={
          edita ? (
            <>
            {!medico.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoMedico.bind(null, id)}>{medico.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {medico._count.cirurgias === 0 && (
              <ActionButton action={excluirMedico.bind(null, id)} variant="danger" confirm="Excluir este médico?">
                Excluir
              </ActionButton>
            )}
          </>
          ) : undefined
        }
      />
      <Card>
        <SomenteLeitura edita={edita} dono="Comercial">
          <MedicoForm key={String(medico.ativo)} medico={medico} />
        </SomenteLeitura>
      </Card>
    </>
  );
}
