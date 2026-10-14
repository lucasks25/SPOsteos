import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Field, Form, Grid, Select } from "@/components/form";
import { criarUsuario } from "../actions";
import { PERFIL_OPTIONS } from "../perfis";

export default async function NovoUsuarioPage() {
  await requireUser([]);
  return (
    <>
      <PageHeader title="Novo usuário" />
      <Card>
        <Form action={criarUsuario} redirectTo="/admin/usuarios">
          <Grid cols={2}>
            <Field label="Nome *" name="nome" required />
            <Field label="E-mail *" name="email" type="email" required autoComplete="off" />
            <Select label="Perfil *" name="perfil" options={PERFIL_OPTIONS} required />
            <Field label="Senha inicial *" name="senha" type="password" minLength={8} required autoComplete="new-password" hint="Mínimo de 8 caracteres" />
          </Grid>
        </Form>
      </Card>
    </>
  );
}
