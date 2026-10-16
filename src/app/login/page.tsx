import { connection } from "next/server";
import { Form, Field } from "@/components/form";
import { Marca } from "@/components/marca";
import { login } from "./actions";

export default async function LoginPage() {
  // renderização dinâmica: a CSP com nonce só funciona em páginas geradas a cada requisição
  await connection();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 sm:p-8">
      {/* fundo neutro com o isotipo da SP OSTEOS em marca d'água e dois halos nas cores da marca (roxo e azul) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#4b2a85]/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[36rem] w-[36rem] rounded-full bg-[#1b7fc4]/10 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="absolute -bottom-24 -right-16 w-[34rem] max-w-[80vw] opacity-[0.08] saturate-50 sm:-right-24 lg:w-[44rem]" />
      </div>

      <main className="relative w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9">
          <div className="mb-8 flex justify-center">
            <Marca variante="login" />
          </div>
          <h1 className="text-center text-2xl font-extrabold text-slate-900">Entrar</h1>
          <p className="mb-7 mt-1.5 text-center text-sm text-slate-600">Use seu e-mail e sua senha de acesso.</p>
          <Form action={login} submitLabel="Entrar" className="[&_button[type=submit]]:h-11 [&_button[type=submit]]:w-full [&>div:last-child]:border-0 [&>div:last-child]:pt-2">
            <Field label="E-mail" name="email" type="email" required autoComplete="email" autoFocus />
            <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
          </Form>
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">Sistema de gestão da SP OSTEOS · acesso restrito a usuários autorizados.</p>
      </main>
    </div>
  );
}
