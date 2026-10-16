import { Field, Form, Grid } from "@/components/form";
import type { LinhaProduto } from "@/generated/prisma/client";
import { salvarLinha } from "./actions";

export function LinhaForm({ linha }: { linha?: LinhaProduto }) {
  const l = linha;
  return (
    <Form action={salvarLinha.bind(null, l?.id ?? null)} redirectTo="/cadastros/linhas">
      <Grid cols={3}>
        <Field label="Código *" name="codigo" defaultValue={l?.codigo} required maxLength={20} placeholder="COL-FIX" hint="Único. Fica em maiúsculas." />
        <Field label="Nome *" name="nome" defaultValue={l?.nome} required maxLength={120} className="sm:col-span-2" />
        <Field label="Grupo *" name="grupo" defaultValue={l?.grupo} required maxLength={60} placeholder="Implantáveis" hint="Categoria do site: Implantáveis, Biológicos, Descartáveis, Instrumentais" />
        <Field label="Ordem" name="ordem" type="number" min="0" max="9999" defaultValue={l?.ordem ?? 0} hint="Posição nas listas e nos relatórios" />
      </Grid>
      <Field label="Ativa" name="ativo" type="checkbox" defaultChecked={l?.ativo ?? true} hint="Inativa não aparece para novos produtos; os já ligados continuam." />
    </Form>
  );
}
