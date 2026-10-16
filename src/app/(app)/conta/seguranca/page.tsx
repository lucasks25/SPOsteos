import Link from "next/link";
import { ActionButton, Field, Form } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { mfaObrigatoria } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { CadastroMfa } from "@/app/login/_mfa/cadastro";
import { FormCodigoComRecuperacao } from "@/app/login/_mfa/codigos";
import { desligarMfa, encerrarOutrasSessoes, novosCodigosRecuperacao } from "../actions";

/** Minha conta → Segurança: verificação em duas etapas, códigos de recuperação, sessões e senha. */
export default async function SegurancaContaPage() {
  const user = await requireUser();
  const u = await db.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { mfaAtivadoEm: true, mfaRecuperacao: true } });
  const obrigatoria = mfaObrigatoria(user.perfil);
  return (
    <>
      <PageHeader title="Segurança da conta" subtitle={`Conta ${user.email}.`} />
      <div className="grid max-w-3xl gap-4">
        <Card title="Verificação em duas etapas">
          {u.mfaAtivadoEm ? (
            <div className="space-y-4 text-sm text-slate-700">
              <p>
                Ativa desde {date(u.mfaAtivadoEm)}. Restam <strong>{u.mfaRecuperacao.length}</strong> código(s) de recuperação.
                {obrigatoria && " Para o seu perfil ela é obrigatória."}
              </p>
              <div>
                <h3 className="mb-2 font-medium text-slate-900">Gerar novos códigos de recuperação</h3>
                <FormCodigoComRecuperacao action={novosCodigosRecuperacao} rotulo="Código atual do aplicativo" botao="Gerar novos códigos" continuarHref="/conta/seguranca" />
              </div>
              {!obrigatoria && (
                <div>
                  <h3 className="mb-2 font-medium text-slate-900">Desativar</h3>
                  <Form action={desligarMfa} submitLabel="Desativar" submitVariant="danger" compacto>
                    <Field label="Código atual do aplicativo" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
                  </Form>
                </div>
              )}
            </div>
          ) : (
            <CadastroMfa userId={user.id} continuarHref="/conta/seguranca" />
          )}
        </Card>
        <Card title="Sessões">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
            <p>Esqueceu o sistema aberto em outro computador? Encerre as outras sessões; esta continua.</p>
            <ActionButton action={encerrarOutrasSessoes} confirm="Encerrar as sessões abertas em outros aparelhos?">
              Encerrar outras sessões
            </ActionButton>
          </div>
        </Card>
        <Card title="Senha">
          <Link href="/conta/senha" className="text-sm font-medium text-teal-700 underline">
            Trocar minha senha
          </Link>
        </Card>
      </div>
    </>
  );
}
