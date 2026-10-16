import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../../_lib/acoes";
import { podeEditarCadastro, SomenteLeitura } from "../../_lib/somente-leitura";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { LinhaForm } from "../linha-form";
import { alternarAtivoLinha, excluirLinha } from "../actions";

export default async function EditarLinhaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_PRODUTO);
  const { id } = await params;
  const linha = await db.linhaProduto.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
  if (!linha) notFound();
  return (
    <>
      <PageHeader
        voltar={{ href: "/cadastros/linhas", label: "Linhas de produto" }}
        title={linha.nome}
        meta={[`Código ${linha.codigo}`, `${linha._count.produtos} produto(s)`]}
        actions={
          edita ? (
            <>
              {!linha.ativo && <Badge>inativa</Badge>}
              <ActionButton action={alternarAtivoLinha.bind(null, id)}>{linha.ativo ? "Inativar" : "Ativar"}</ActionButton>
              {linha._count.produtos === 0 && (
                <ActionButton action={excluirLinha.bind(null, id)} variant="danger" confirm="Excluir esta linha?">
                  Excluir
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />
      <Card>
        <SomenteLeitura edita={edita} dono="Comercial, Compras, Qualidade ou Estoque">
          <LinhaForm key={String(linha.ativo)} linha={linha} />
        </SomenteLeitura>
      </Card>
    </>
  );
}
