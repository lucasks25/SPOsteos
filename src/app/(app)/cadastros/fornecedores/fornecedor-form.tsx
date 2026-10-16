import { Field, Form, Grid, Select } from "@/components/form";
import type { Fornecedor } from "@/generated/prisma/client";
import { UF_OPTIONS } from "@/lib/documentos-br";
import { salvarFornecedor } from "./actions";

export function FornecedorForm({ fornecedor }: { fornecedor?: Fornecedor }) {
  const f = fornecedor;
  return (
    <Form action={salvarFornecedor.bind(null, f?.id ?? null)} redirectTo="/cadastros/fornecedores">
      <Grid cols={3}>
        <Field label="Razão social *" name="razaoSocial" defaultValue={f?.razaoSocial} required className="sm:col-span-2" />
        <Field label="Nome fantasia" name="nomeFantasia" defaultValue={f?.nomeFantasia ?? ""} />
        <Field label="CNPJ *" name="cnpj" defaultValue={f?.cnpj} required placeholder="00.000.000/0000-00" />
        <Field label="Inscrição estadual" name="ie" defaultValue={f?.ie ?? ""} />
        <Field label="AFE ANVISA" name="afe" defaultValue={f?.afe ?? ""} hint="Autorização de Funcionamento" />
        <Field label="E-mail" name="email" type="email" defaultValue={f?.email ?? ""} />
        <Field label="Telefone" name="telefone" defaultValue={f?.telefone ?? ""} />
        <div className="grid grid-cols-3 gap-4">
          <Field label="Cidade" name="cidade" defaultValue={f?.cidade ?? ""} className="col-span-2" />
          <Select label="UF" name="uf" defaultValue={f?.uf ?? ""} options={UF_OPTIONS} placeholder="—" />
        </div>
      </Grid>
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={f?.ativo ?? true} />
    </Form>
  );
}
