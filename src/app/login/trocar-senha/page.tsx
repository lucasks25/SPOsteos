import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Field, Form } from "@/components/form";
import { requireUserPendente } from "@/lib/auth";
import { SENHA_MAX, SENHA_MIN } from "@/lib/auth-senha";
import { trocarSenhaObrigatoria } from "../actions";
import { MolduraLogin } from "../_mfa/moldura";

/** Primeiro acesso (ou senha redefinida pelo admin): a senha provisória tem de ser trocada antes de qualquer tela. */
export default async function TrocarSenhaObrigatoriaPage() {
  await connection();
  const user = await requireUserPendente();
  if (user.pendencia !== "senha") redirect("/");
  return (
    <MolduraLogin titulo="Crie a sua senha" largura="max-w-md">
      <p className="mb-4 text-sm text-slate-700">
        A senha que você recebeu é provisória. Crie uma só sua: de {SENHA_MIN} a {SENHA_MAX} caracteres, sem o seu nome ou e-mail. Uma frase curta é fácil de lembrar e difícil de adivinhar.
      </p>
      <Form action={trocarSenhaObrigatoria} submitLabel="Salvar senha">
        <Field label="Senha provisória" name="atual" type="password" autoComplete="current-password" required autoFocus />
        <Field label="Nova senha" name="nova" type="password" autoComplete="new-password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required />
        <Field label="Repita a nova senha" name="confirma" type="password" autoComplete="new-password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required />
      </Form>
    </MolduraLogin>
  );
}
