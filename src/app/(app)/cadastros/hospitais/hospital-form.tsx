import { Field, Form, Grid, Select } from "@/components/form";
import type { Hospital } from "@/generated/prisma/client";
import { UF_OPTIONS } from "../_lib/documentos";
import { salvarHospital } from "./actions";

export function HospitalForm({ hospital, tabelas }: { hospital?: Hospital; tabelas: { id: string; nome: string }[] }) {
  const h = hospital;
  return (
    <Form action={salvarHospital.bind(null, h?.id ?? null)} redirectTo={h ? undefined : "/cadastros/hospitais"}>
      <Grid cols={3}>
        <Field label="Razão social *" name="razaoSocial" defaultValue={h?.razaoSocial} required className="sm:col-span-2" />
        <Field label="Nome fantasia" name="nomeFantasia" defaultValue={h?.nomeFantasia ?? ""} />
        <Field label="CNPJ *" name="cnpj" defaultValue={h?.cnpj} required placeholder="00.000.000/0000-00" />
        <Field label="Inscrição estadual" name="ie" defaultValue={h?.ie ?? ""} />
        <Field label="E-mail" name="email" type="email" defaultValue={h?.email ?? ""} />
        <Field label="Telefone" name="telefone" defaultValue={h?.telefone ?? ""} />
        <Field label="Endereço" name="endereco" defaultValue={h?.endereco ?? ""} className="sm:col-span-2" />
        <Field label="Bairro" name="bairro" defaultValue={h?.bairro ?? ""} />
        <Field label="CEP" name="cep" defaultValue={h?.cep ?? ""} maxLength={9} placeholder="00000-000" hint="Necessário para emitir cobrança" />
        <Field label="Cidade" name="cidade" defaultValue={h?.cidade ?? ""} />
        <Select label="UF" name="uf" defaultValue={h?.uf ?? ""} options={UF_OPTIONS} placeholder="—" />
        <Field label="Prazo de pagamento (dias) *" name="prazoPagamentoDias" type="number" min="0" max="365" defaultValue={h?.prazoPagamentoDias ?? 30} required />
        <Select label="Tabela de preço" name="tabelaPrecoId" defaultValue={h?.tabelaPrecoId ?? ""} options={tabelas.map((t) => ({ value: t.id, label: t.nome }))} placeholder="Preço base do produto" />
      </Grid>
      <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={h?.ativo ?? true} />
    </Form>
  );
}
