import { Form, Field } from "@/components/form";
import { login } from "./actions";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-900 to-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-slate-900">Gestão OPME</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Entre com sua conta</p>
        <Form action={login} submitLabel="Entrar">
          <Field label="E-mail" name="email" type="email" required autoComplete="email" />
          <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
        </Form>
      </div>
    </div>
  );
}
