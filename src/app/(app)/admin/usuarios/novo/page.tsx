import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Field, Form, Grid, Select } from "@/components/form";
import { SENHA_MAX, SENHA_MIN } from "@/lib/auth-senha";
import { criarUsuario } from "../actions";
import { PERFIL_OPTIONS } from "../perfis";

export default async function NovoUsuarioPage() {
  await requireUser([]);
  return (
    <>
      <PageHeader voltar={{ href: "/admin/usuarios", label: "Usuários" }} title="Novo usuário" subtitle="Defina o perfil de acesso e uma senha provisória: no primeiro acesso a pessoa cria a dela. O usuário pode ser inativado depois." />
      <Card>
        <Form action={criarUsuario} redirectTo="/admin/usuarios">
          <Grid cols={2}>
            <Field label="Nome *" name="nome" required maxLength={200} />
            <Field label="E-mail *" name="email" type="email" required autoComplete="off" />
            <Select label="Perfil *" name="perfil" options={PERFIL_OPTIONS} required />
            <Field label="Senha provisória *" name="senha" type="password" minLength={SENHA_MIN} maxLength={SENHA_MAX} required autoComplete="new-password" hint={`De ${SENHA_MIN} a ${SENHA_MAX} caracteres; sem o nome ou o e-mail da pessoa`} />
          </Grid>
        </Form>
      </Card>
    </>
  );
}
