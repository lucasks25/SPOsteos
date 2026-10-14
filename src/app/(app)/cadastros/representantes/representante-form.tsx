import { Field, Form, Grid } from "@/components/form";
import type { Representante } from "@/generated/prisma/client";
import { salvarRepresentante } from "./actions";

export function RepresentanteForm({ rep }: { rep?: Representante }) {
  return (
    <Form action={salvarRepresentante.bind(null, rep?.id ?? null)} redirectTo="/cadastros/representantes">
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={rep?.nome} required className="sm:col-span-2" />
        <Field label="CPF/CNPJ" name="cpfCnpj" defaultValue={rep?.cpfCnpj ?? ""} />
        <Field label="E-mail" name="email" type="email" defaultValue={rep?.email ?? ""} />
        <Field label="Telefone" name="telefone" defaultValue={rep?.telefone ?? ""} />
        <Field label="Comissão (%) *" name="comissaoPercent" type="number" step="0.01" min="0" max="100" defaultValue={rep ? rep.comissaoPercent.toString() : "0"} required />
      </Grid>
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={rep?.ativo ?? true} />
    </Form>
  );
}
