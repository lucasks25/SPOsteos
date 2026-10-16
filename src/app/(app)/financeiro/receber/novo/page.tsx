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
  const parceiros = await listarParceiros("receber");
  const { planos, centros } = await opcoesClassificacao(db);
  return (
    <>
      <PageHeader title={`Novo título — ${TIPOS.receber.singular.toLowerCase()}`} subtitle="Cadastre um recebimento manual. Pedidos faturados geram a conta a receber sozinhos." />
      <Card>
        <TituloForm tipo="receber" parceiros={parceiros} planos={planos} centros={centros} hoje={hojeUTC()} />
      </Card>
    </>
  );
}
