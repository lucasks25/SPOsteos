import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Field, Form, Grid, Select } from "@/components/form";
import { dateTime } from "@/lib/format";
import { editarUsuario, redefinirSenha } from "../actions";
import { PERFIL_OPTIONS } from "../perfis";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser([]);
  const { id } = await params;
  const [u, ultimoLogin] = await Promise.all([
    db.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true } }),
    db.logAuditoria.findFirst({ where: { usuarioId: id, acao: "login" }, orderBy: { criadoEm: "desc" } }),
  ]);
  if (!u) notFound();
  const proprio = u.id === admin.id;
  return (
    <>
      <PageHeader voltar={{ href: "/admin/usuarios", label: "Usuários" }} title={u.nome} subtitle={`${u.email} · último login: ${ultimoLogin ? dateTime(ultimoLogin.criadoEm) : "nunca"}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dados e perfil">
          <Form action={editarUsuario.bind(null, id)} redirectTo="/admin/usuarios">
            <Grid cols={2}>
              <Field label="Nome *" name="nome" defaultValue={u.nome} required />
              <Select label="Perfil *" name="perfil" options={PERFIL_OPTIONS} defaultValue={u.perfil} required disabled={proprio} />
            </Grid>
            {proprio && <input type="hidden" name="perfil" value={u.perfil} />}
            {proprio ? <input type="hidden" name="ativo" value="on" /> : <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={u.ativo} />}
          </Form>
        </Card>
        <Card title="Redefinir senha">
          <Form action={redefinirSenha.bind(null, id)} submitLabel="Redefinir senha" resetOnSuccess>
            <Field label="Nova senha *" name="senha" type="password" minLength={8} required autoComplete="new-password" hint="Mínimo de 8 caracteres" />
          </Form>
        </Card>
      </div>
    </>
  );
}
