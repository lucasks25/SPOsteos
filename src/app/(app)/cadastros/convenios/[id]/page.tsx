import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ConvenioForm } from "../convenio-form";
import { alternarAtivoConvenio, excluirConvenio } from "../actions";

export default async function EditarConvenioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_COMERCIAL);
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
          edita ? (
            <>
            {!convenio.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoConvenio.bind(null, id)}>{convenio.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {vinculos === 0 && (
              <ActionButton action={excluirConvenio.bind(null, id)} variant="danger" confirm="Excluir este convênio?">
                Excluir
              </ActionButton>
            )}
          </>
          ) : undefined
        }
      />
      <Card>
        <SomenteLeitura edita={edita} dono="Comercial">
          <ConvenioForm key={String(convenio.ativo)} convenio={convenio} />
        </SomenteLeitura>
      </Card>
    </>
  );
}
