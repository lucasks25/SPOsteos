import { Field, Form, Grid } from "@/components/form";
import type { Fabricante } from "@/generated/prisma/client";
import { salvarFabricante } from "./actions";

export function FabricanteForm({ fabricante }: { fabricante?: Fabricante }) {
  const f = fabricante;
  return (
    <Form action={salvarFabricante.bind(null, f?.id ?? null)} redirectTo="/cadastros/fabricantes">
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={f?.nome} required />
        <Field label="CNPJ" name="cnpj" defaultValue={f?.cnpj ?? ""} placeholder="00.000.000/0000-00" hint="Opcional para fabricantes estrangeiros" />
        <Field label="País" name="pais" defaultValue={f?.pais ?? ""} placeholder="Brasil" />
      </Grid>
    </Form>
  );
}
