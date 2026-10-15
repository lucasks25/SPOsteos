import { Field, Form, Grid, Select } from "@/components/form";
import type { Fornecedor } from "@/generated/prisma/client";
import { UF_OPTIONS } from "../_lib/documentos";
import { salvarFornecedor } from "./actions";

export function FornecedorForm({ fornecedor, podeBanco = false }: { fornecedor?: Fornecedor; podeBanco?: boolean }) {
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
      {podeBanco && (
      <fieldset className="rounded border border-slate-200 p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-[.04em] text-slate-600">Dados para pagamento (SISPAG)</legend>
        <Grid cols={4}>
          <Field label="Banco (código)" name="bancoCodigo" defaultValue={f?.bancoCodigo ?? ""} maxLength={3} placeholder="341" />
          <Field label="Agência" name="agencia" defaultValue={f?.agencia ?? ""} maxLength={5} hint="Sem dígito" />
          <Field label="Conta" name="conta" defaultValue={f?.conta ?? ""} maxLength={12} hint="Sem dígito" />
          <Field label="Dígito" name="contaDigito" defaultValue={f?.contaDigito ?? ""} maxLength={2} />
          <Field label="Chave Pix" name="chavePix" defaultValue={f?.chavePix ?? ""} maxLength={77} className="sm:col-span-2" hint="E-mail, +55DDDNÚMERO, CPF/CNPJ só números ou chave aleatória" />
        </Grid>
      </fieldset>
      )}
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={f?.ativo ?? true} />
    </Form>
  );
}
