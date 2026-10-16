import { Field, Form } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SENHA_MAX, SENHA_MIN } from "@/lib/auth-login";
import { trocarMinhaSenha } from "../actions";

export default async function TrocarSenhaPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Trocar minha senha" subtitle={`Conta ${user.email}. Ao trocar, as outras sessões abertas (outros aparelhos) são encerradas.`} />
      <Card title="Nova senha" className="max-w-xl">
        <Form action={trocarMinhaSenha} submitLabel="Trocar senha" resetOnSuccess>
          <div className="space-y-4">
            <Field label="Senha atual" name="atual" type="password" autoComplete="current-password" required />
            <Field label="Nova senha" name="nova" type="password" autoComplete="new-password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required hint={`De ${SENHA_MIN} a ${SENHA_MAX} caracteres`} />
            <Field label="Repita a nova senha" name="confirma" type="password" autoComplete="new-password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required />
          </div>
        </Form>
      </Card>
    </>
  );
}
