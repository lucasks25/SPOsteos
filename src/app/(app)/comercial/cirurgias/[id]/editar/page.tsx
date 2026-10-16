import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditLeitura } from "@/lib/forms";
import { CTX_CARTEIRINHA, decifrar } from "@/lib/cripto";
import { Card, PageHeader } from "@/components/ui";
import { opcoesCirurgia } from "@/app/(app)/cadastros/_lib/publico";
import { CirurgiaForm } from "../../cirurgia-form";

export default async function EditarCirurgiaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["COMERCIAL"]);
  const { id } = await params;
  const [cirurgia, opcoes] = await Promise.all([db.cirurgia.findUnique({ where: { id } }), opcoesCirurgia(false)]);
  if (!cirurgia) notFound();
  await auditLeitura(user.id, "Cirurgia", cirurgia.id, `CIR-${cirurgia.numero} (edição)`);
  const bloqueada = cirurgia.status === "FATURADA" || cirurgia.status === "CANCELADA";
  // carteirinha ilegível (chave errada/ausente) não pode ir ao formulário: salvar gravaria o aviso no lugar do dado
  let carteirinha: string | null = null;
  let ilegivel = false;
  try {
    carteirinha = cirurgia.carteirinha === null ? null : decifrar(cirurgia.carteirinha, CTX_CARTEIRINHA);
  } catch (e) {
    ilegivel = true;
    console.error(`[cripto] carteirinha da CIR-${cirurgia.numero}: ${(e as Error).message}`);
  }
  return (
    <>
      <PageHeader
        title={`Editar cirurgia CIR-${cirurgia.numero}`}
        meta={[cirurgia.paciente]}
        voltar={{ href: `/comercial/cirurgias/${id}`, label: `Cirurgia CIR-${cirurgia.numero}` }}
      />
      <Card>
        {bloqueada ? (
          <p className="text-sm text-slate-600">Cirurgia {cirurgia.status.toLowerCase()} não pode ser editada. Volte para a cirurgia para consultar os dados.</p>
        ) : ilegivel ? (
          <p className="text-sm text-slate-600">A carteirinha desta cirurgia não pôde ser decifrada (chave de dados ausente ou trocada). Avise o administrador antes de editar.</p>
        ) : (
          <CirurgiaForm cirurgia={{ ...cirurgia, carteirinha }} opcoes={opcoes} />
        )}
      </Card>
    </>
  );
}
