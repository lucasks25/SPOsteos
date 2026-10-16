import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUserPendente } from "@/lib/auth";
import { CadastroMfa } from "../_mfa/cadastro";
import { MolduraLogin } from "../_mfa/moldura";

/** Perfil que exige 2º fator (src/lib/auth-config.ts, mfaObrigatoria) e ainda não cadastrou o aplicativo. */
export default async function AtivarMfaObrigatoriaPage() {
  await connection();
  const user = await requireUserPendente();
  if (user.pendencia === "senha") redirect("/login/trocar-senha");
  if (user.mfaAtivo) redirect("/");
  return (
    <MolduraLogin titulo="Ative a verificação em duas etapas" largura="max-w-md">
      <p className="mb-4 text-sm text-slate-700">
        O seu perfil movimenta dinheiro, dados bancários ou acessos. Por isso, além da senha, o sistema pede um código do aplicativo autenticador do seu celular.
      </p>
      <CadastroMfa userId={user.id} continuarHref="/" />
    </MolduraLogin>
  );
}
