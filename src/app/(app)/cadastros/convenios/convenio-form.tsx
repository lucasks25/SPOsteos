import { Field, Form, Grid } from "@/components/form";
import type { Convenio } from "@/generated/prisma/client";
import { salvarConvenio } from "./actions";

export function ConvenioForm({ convenio }: { convenio?: Convenio }) {
  const c = convenio;
  return (
    <Form action={salvarConvenio.bind(null, c?.id ?? null)} redirectTo="/cadastros/convenios">
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={c?.nome} required />
        <Field label="Registro ANS" name="registroAns" defaultValue={c?.registroAns ?? ""} inputMode="numeric" maxLength={6} hint="6 dígitos" />
        <Field label="CNPJ" name="cnpj" defaultValue={c?.cnpj ?? ""} placeholder="00.000.000/0000-00" />
      </Grid>
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={c?.ativo ?? true} />
    </Form>
  );
}
