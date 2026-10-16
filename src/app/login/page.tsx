import { connection } from "next/server";
import { Form, Field } from "@/components/form";
import { btn } from "@/components/ui";
import { lerMfaPendente } from "@/lib/auth";
import { cancelarCodigoLogin, confirmarCodigoLogin, login } from "./actions";
import { MolduraLogin } from "./_mfa/moldura";

const BOTAO_CHEIO = "[&_button[type=submit]]:h-10 [&_button[type=submit]]:w-full [&>div:last-child]:border-0 [&>div:last-child]:pt-1";

export default async function LoginPage() {
  // renderização dinâmica: a CSP com nonce só funciona em páginas geradas a cada requisição
  await connection();
  // senha já conferida (cookie curto e assinado): falta o código do aplicativo autenticador
  if (await lerMfaPendente()) {
    return (
      <MolduraLogin titulo="Verificação em duas etapas">
        <Form action={confirmarCodigoLogin} submitLabel="Confirmar" className={BOTAO_CHEIO}>
          <Field
            label="Código do aplicativo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={11}
            required
            autoFocus
            hint="6 dígitos do aplicativo autenticador. Sem o celular: um código de recuperação (XXXXX-XXXXX)."
          />
        </Form>
        <form action={cancelarCodigoLogin} className="mt-3 text-center">
          <button type="submit" className={btn.ghost}>
            Voltar e entrar com outra conta
          </button>
        </form>
      </MolduraLogin>
    );
  }
  return (
    <MolduraLogin titulo="Entrar no sistema">
      <Form action={login} submitLabel="Entrar" className={BOTAO_CHEIO}>
        <Field label="E-mail" name="email" type="email" required autoComplete="email" autoFocus />
        <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
      </Form>
    </MolduraLogin>
  );
}
