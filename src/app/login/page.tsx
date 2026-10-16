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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-teal-900 p-12 text-white lg:flex">
        <Marca variante="login" sobreEscuro />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Gestão de órteses, próteses e materiais especiais</h2>
          <p className="mt-3 text-teal-100/80">Da cirurgia ao recebimento, com o controle que a rastreabilidade e o financeiro exigem.</p>
          <ul className="mt-8 space-y-4">
            {PONTOS.map((p) => (
              <li key={p.texto} className="flex items-center gap-3 text-sm text-teal-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-teal-200">
                  <Icon name={p.icone} size={16} />
                </span>
                {p.texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-teal-100/50">Acesso restrito a usuários autorizados.</p>
      </aside>

      <main className="flex items-center justify-center bg-white p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Marca variante="login" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use seu e-mail e sua senha de acesso.</p>
          <Form action={login} submitLabel="Entrar" className="[&_button[type=submit]]:w-full [&_button[type=submit]]:h-10">
            <Field label="E-mail" name="email" type="email" required autoComplete="email" autoFocus />
            <Field label="Senha" name="senha" type="password" required autoComplete="current-password" />
          </Form>
        </div>
      </main>
    </div>
  );
}
