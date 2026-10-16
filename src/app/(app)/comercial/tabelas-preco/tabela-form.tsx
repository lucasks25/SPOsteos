import { Field, Form, Grid } from "@/components/form";
import { inputDate } from "@/lib/format";
import type { TabelaPreco } from "@/generated/prisma/client";
import { salvarTabela } from "./actions";

export function TabelaForm({ tabela }: { tabela?: TabelaPreco }) {
  return (
    <Form action={salvarTabela.bind(null, tabela?.id ?? null)} submitLabel={tabela ? "Salvar" : "Criar e incluir preços"}>
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={tabela?.nome} required maxLength={200} />
        <Field label="Vigência — início" name="vigenciaInicio" type="date" defaultValue={inputDate(tabela?.vigenciaInicio)} />
        <Field label="Vigência — fim" name="vigenciaFim" type="date" defaultValue={inputDate(tabela?.vigenciaFim)} hint="Vazio = sem prazo" />
      </Grid>
    </Form>
  );
}
