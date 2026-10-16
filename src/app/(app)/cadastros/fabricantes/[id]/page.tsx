import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_SUPRIMENTOS } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { podeIrParaDocumentos } from "../../_lib/permissoes";
import { VerDocumentos } from "../../_lib/link-documentos";
import { Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { FabricanteForm } from "../fabricante-form";
import { excluirFabricante } from "../actions";

export default async function EditarFabricantePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_SUPRIMENTOS);
  const { id } = await params;
  const fabricante = await db.fabricante.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
  if (!fabricante) notFound();
  return (
    <>
      <PageHeader
        voltar={{ href: "/cadastros/fabricantes", label: "Fabricantes" }}
        title={fabricante.nome}
        meta={[`${fabricante._count.produtos} produto(s) vinculado(s)`]}
        actions={
          edita && fabricante._count.produtos === 0 ? (
            <ActionButton action={excluirFabricante.bind(null, id)} variant="danger" confirm="Excluir este fabricante?">
              Excluir
            </ActionButton>
          ) : undefined
        }
      />
      <Card>
        <SomenteLeitura edita={edita} dono="Compras, Estoque ou Qualidade">
          <FabricanteForm fabricante={fabricante} />
        </SomenteLeitura>
      </Card>
      {podeIrParaDocumentos(user.perfil) && <VerDocumentos campo="fabricanteId" id={id} />}
    </>
  );
}
