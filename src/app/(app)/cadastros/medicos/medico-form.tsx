import { Field, Form, Grid, Select } from "@/components/form";
import type { Medico } from "@/generated/prisma/client";
import { UF_OPTIONS } from "../_lib/documentos";
import { salvarMedico } from "./actions";

export function MedicoForm({ medico }: { medico?: Medico }) {
  const m = medico;
  return (
    <Form action={salvarMedico.bind(null, m?.id ?? null)} redirectTo="/cadastros/medicos">
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={m?.nome} required className="sm:col-span-2" />
        <Field label="Especialidade" name="especialidade" defaultValue={m?.especialidade ?? ""} />
        <Field label="CRM *" name="crm" defaultValue={m?.crm} required inputMode="numeric" />
        <Select label="UF do CRM *" name="ufCrm" defaultValue={m?.ufCrm ?? ""} options={UF_OPTIONS} required />
        <div />
        <Field label="E-mail" name="email" type="email" defaultValue={m?.email ?? ""} />
        <Field label="Telefone" name="telefone" defaultValue={m?.telefone ?? ""} />
      </Grid>
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={m?.ativo ?? true} />
    </Form>
  );
}
