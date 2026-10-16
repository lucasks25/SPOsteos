import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { TIPOS } from "../../_lib/config";
import { listarParceiros } from "../../_lib/queries";
import { hojeUTC } from "@/lib/datas";
import { opcoesClassificacao } from "../../_lib/plano";
import { db } from "@/lib/db";
import { TituloForm } from "../../_lib/titulo-form";

export default async function Page() {
  await requireUser(["FINANCEIRO"]);
  const parceiros = await listarParceiros("pagar");
  const { planos, centros } = await opcoesClassificacao(db);
  return (
    <>
      <PageHeader voltar={{ href: "/financeiro/pagar", label: "Contas a pagar" }} title={`Novo título — ${TIPOS.pagar.singular.toLowerCase()}`} subtitle="Cadastre uma obrigação manual. Compras recebidas geram a conta a pagar sozinhas." />
      <Card>
        <TituloForm tipo="pagar" parceiros={parceiros} planos={planos} centros={centros} hoje={hojeUTC()} />
      </Card>
    </>
  );
}
