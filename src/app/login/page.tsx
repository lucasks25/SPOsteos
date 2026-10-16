import { connection } from "next/server";
import { Form, Field } from "@/components/form";
import { Marca } from "@/components/marca";
import { login } from "./actions";

export default async function LoginPage() {
  // renderização dinâmica: a CSP com nonce só funciona em páginas geradas a cada requisição
  await connection();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 sm:p-8">
      {/* fundo neutro com o isotipo da SP OSTEOS em marca d'água (sem halos nem gradientes) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="absolute -bottom-24 -right-16 w-[34rem] max-w-[80vw] opacity-[0.08] saturate-50 sm:-right-24 lg:w-[44rem]" />
      </div>

      <main className="relative w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-6 flex justify-center">
            <Marca variante="login" />
          </div>
          <h1 className="mb-5 text-center text-lg font-semibold text-slate-900">Entrar no sistema</h1>
          <Form action={login} submitLabel="Entrar" className="[&_button[type=submit]]:h-10 [&_button[type=submit]]:w-full [&>div:last-child]:border-0 [&>div:last-child]:pt-1">
            <Field label="E-mail" name="email" type="email" required autoComplete="email" autoFocus />
            <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
          </Form>
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">Sistema de gestão da SP OSTEOS · acesso restrito a usuários autorizados.</p>
      </main>
    </div>
  );
}
