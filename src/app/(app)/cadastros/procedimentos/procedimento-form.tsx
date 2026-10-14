import { Field, Form, Grid } from "@/components/form";
import type { Procedimento } from "@/generated/prisma/client";
import { salvarProcedimento } from "./actions";

export function ProcedimentoForm({ proc }: { proc?: Procedimento }) {
  return (
    <Form action={salvarProcedimento.bind(null, proc?.id ?? null)} submitLabel={proc ? "Salvar" : "Criar e incluir materiais"}>
      <Grid cols={3}>
        <Field label="Código TUSS" name="codigoTuss" defaultValue={proc?.codigoTuss ?? ""} inputMode="numeric" />
        <Field label="Descrição *" name="descricao" defaultValue={proc?.descricao} required className="sm:col-span-2" />
        <Field label="Especialidade" name="especialidade" defaultValue={proc?.especialidade ?? ""} />
      </Grid>
    </Form>
  );
}
