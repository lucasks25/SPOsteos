import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Card, PageHeader } from "@/components/ui";
import { RepresentanteForm } from "../representante-form";

export default async function EditarRepresentantePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_COMERCIAL);
  const { id } = await params;
  const rep = await db.representante.findUnique({ where: { id } });
  if (!rep) notFound();
  return (
    <>
      <PageHeader voltar={{ href: "/cadastros/representantes", label: "Representantes" }} title={rep.nome} subtitle="Representante comercial" />
      <Card>
        <SomenteLeitura edita={edita} dono="Comercial">
          <RepresentanteForm rep={rep} />
        </SomenteLeitura>
      </Card>
    </>
  );
}
