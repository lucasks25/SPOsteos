import { requireUser } from "@/lib/auth";
import { TituloDetalhe } from "../../_lib/titulo-detalhe";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  return <TituloDetalhe tipo="pagar" id={id} />;
}
