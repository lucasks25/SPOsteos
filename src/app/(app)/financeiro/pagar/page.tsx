import { requireUser } from "@/lib/auth";
import { TitulosLista } from "../_lib/titulos-view";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["FINANCEIRO"]);
  return <TitulosLista tipo="pagar" searchParams={await searchParams} />;
}
