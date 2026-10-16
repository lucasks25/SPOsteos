import { connection } from "next/server";
import { Form, Field } from "@/components/form";
import { Marca } from "@/components/marca";
import { Icon } from "@/components/icons";
import { login } from "./actions";

const PONTOS = [
  { icone: "pacote" as const, texto: "Estoque, consignação e rastreabilidade por lote" },
  { icone: "carrinho" as const, texto: "Cirurgias, orçamentos e faturamento dos hospitais" },
  { icone: "banco" as const, texto: "Financeiro com conciliação, SISPAG e cobrança" },
];

export default async function LoginPage() {
  // renderização dinâmica: a CSP com nonce só funciona em páginas geradas a cada requisição
  await connection();
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-fg lg:flex">
        {/* brilho menta discreto no canto: a única decoração da faixa */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-sidebar-destaque/10 blur-3xl" aria-hidden="true" />
        <Marca variante="login" sobreEscuro />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight text-sidebar-fg-ativo">Gestão de órteses, próteses e materiais especiais</h2>
          <p className="mt-4 text-base text-sidebar-fg">Da cirurgia ao recebimento, com o controle que a rastreabilidade e o financeiro exigem.</p>
          <ul className="mt-10 space-y-3">
            {PONTOS.map((p) => (
              <li key={p.texto} className="flex items-center gap-3 rounded-2xl bg-[rgb(255_255_255/0.05)] px-4 py-3 text-sm text-sidebar-fg-ativo ring-1 ring-[rgb(255_255_255/0.08)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-destaque text-sidebar">
                  <Icon name={p.icone} size={17} />
                </span>
                {p.texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-fg">Acesso restrito a usuários autorizados.</p>
      </aside>

      <main className="flex items-center justify-center p-4 sm:p-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-9">
          <div className="mb-8 lg:hidden">
            <Marca variante="login" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Entrar</h1>
          <p className="mb-7 mt-1.5 text-sm text-slate-600">Use seu e-mail e sua senha de acesso.</p>
          <Form action={login} submitLabel="Entrar" className="[&_button[type=submit]]:h-11 [&_button[type=submit]]:w-full [&>div:last-child]:border-0 [&>div:last-child]:pt-2">
            <Field label="E-mail" name="email" type="email" required autoComplete="email" autoFocus />
            <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
          </Form>
        </div>
      </main>
    </div>
  );
}
