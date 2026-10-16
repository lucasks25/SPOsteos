import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { diasAtras, inputDate } from "@/lib/format";
import type { Orcamento } from "@/generated/prisma/client";
import type { Opcao } from "@/app/(app)/cadastros/_lib/publico";
import { salvarOrcamento } from "./actions";

export function OrcamentoForm({ orc, hospitais, convenios }: { orc?: Orcamento; hospitais: Opcao[]; convenios: Opcao[] }) {
  const validadePadrao = diasAtras(-15);
  return (
    <Form action={salvarOrcamento.bind(null, orc?.id ?? null)} submitLabel={orc ? "Salvar" : "Criar e incluir itens"} submitVariant={orc ? "secondary" : "primary"}>
      <Grid cols={2}>
        <Select label="Hospital *" name="hospitalId" options={hospitais} defaultValue={orc?.hospitalId ?? ""} required />
        <Select label="Convênio" name="convenioId" options={convenios} defaultValue={orc?.convenioId ?? ""} />
        <Field label="Paciente" name="paciente" defaultValue={orc?.paciente ?? ""} />
        <Field label="Válido até" name="validade" type="date" defaultValue={inputDate(orc?.validade ?? validadePadrao)} />
      </Grid>
      <TextArea label="Observação" name="observacao" defaultValue={orc?.observacao ?? ""} maxLength={1000} />
    </Form>
  );
}
