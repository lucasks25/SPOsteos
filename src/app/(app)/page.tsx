import { requireUser } from "@/lib/auth";
import { ConteudoPainel } from "./_painel/painel";

/** Painel: só leitura e navegação (composição em _painel/). */
export default async function Painel() {
  const user = await requireUser();
  return <ConteudoPainel nome={user.nome} perfil={user.perfil} />;
}
