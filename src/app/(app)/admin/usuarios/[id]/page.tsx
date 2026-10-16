import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { mfaObrigatoria } from "@/lib/auth-config";
import { SENHA_MAX, SENHA_MIN } from "@/lib/auth-senha";
import { dateTime } from "@/lib/format";
import { editarUsuario, redefinirSenha, zerarMfa } from "../actions";
import { PERFIL_OPTIONS } from "../perfis";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser([]);
  const { id } = await params;
  const [u, ultimoLogin] = await Promise.all([
    db.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true, senhaExpirada: true, mfaAtivadoEm: true } }),
    db.logAuditoria.findFirst({ where: { usuarioId: id, acao: "login" }, orderBy: { criadoEm: "desc" } }),
  ]);
  if (!u) notFound();
  const proprio = u.id === admin.id;
  return (
    <>
      <PageHeader voltar={{ href: "/admin/usuarios", label: "Usuários" }} title={u.nome} meta={[`${u.email} · último login: ${ultimoLogin ? dateTime(ultimoLogin.criadoEm) : "nunca"}`]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dados e perfil">
          <Form action={editarUsuario.bind(null, id)} redirectTo="/admin/usuarios">
            <Grid cols={2}>
              <Field label="Nome *" name="nome" defaultValue={u.nome} required maxLength={200} />
              <Select label="Perfil *" name="perfil" options={PERFIL_OPTIONS} defaultValue={u.perfil} required disabled={proprio} />
            </Grid>
            {proprio && <input type="hidden" name="perfil" value={u.perfil} />}
            {proprio ? <input type="hidden" name="ativo" value="on" /> : <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={u.ativo} />}
          </Form>
        </Card>
        <Card title="Redefinir senha">
          {proprio ? (
            <p className="text-sm text-slate-700">Para a sua própria senha, use Minha conta → Trocar minha senha (pede a senha atual).</p>
          ) : (
            <Form action={redefinirSenha.bind(null, id)} submitLabel="Redefinir senha" submitVariant="secondary" resetOnSuccess>
              <Field label="Senha provisória *" name="senha" type="password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required autoComplete="new-password" hint={`De ${SENHA_MIN} a ${SENHA_MAX} caracteres. A pessoa troca no próximo acesso.${u.senhaExpirada ? " (Ainda não trocou a provisória atual.)" : ""}`} />
            </Form>
          )}
        </Card>
        <Card title="Verificação em duas etapas">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
            <p>
              {u.mfaAtivadoEm ? `Ativa desde ${dateTime(u.mfaAtivadoEm)}.` : "Não cadastrada."}
              {mfaObrigatoria(u.perfil) && " Obrigatória para este perfil."}
            </p>
            {u.mfaAtivadoEm && !proprio && (
              <ActionButton action={zerarMfa.bind(null, id)} variant="danger" confirm="Zerar a verificação em duas etapas desta pessoa? Use só se ela perdeu o celular e os códigos de recuperação; confirme a identidade dela antes.">
                Zerar 2º fator
              </ActionButton>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
