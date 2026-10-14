import { Field, Form, Grid } from "@/components/form";
import type { Kit } from "@/generated/prisma/client";
import { salvarKit } from "./actions";

export function KitForm({ kit }: { kit?: Kit }) {
  return (
    <Form action={salvarKit.bind(null, kit?.id ?? null)} submitLabel={kit ? "Salvar" : "Criar e incluir itens"}>
      <Grid cols={3}>
        <Field label="Código *" name="codigo" defaultValue={kit?.codigo} required />
        <Field label="Descrição *" name="descricao" defaultValue={kit?.descricao} required className="sm:col-span-2" />
      </Grid>
    </Form>
  );
}
