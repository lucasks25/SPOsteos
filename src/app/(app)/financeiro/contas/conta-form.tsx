import { Field, Form, Grid, Select } from "@/components/form";
import { salvarConta } from "../_lib/contas-actions";

type Conta = { id: string; nome: string; tipo: string; banco: string | null; agencia: string | null; numero: string | null; saldoInicial: number; titularCnpj?: string | null; titularNome?: string | null };

export function ContaForm({ conta }: { conta?: Conta }) {
  return (
    <Form action={salvarConta.bind(null, conta?.id ?? null)} submitLabel={conta ? "Salvar alterações" : "Criar conta"}>
      <Grid cols={3}>
        <Field label="Nome *" name="nome" defaultValue={conta?.nome} required maxLength={80} hint="Ex.: Itaú c/c 12345-6, Caixa. Para SISPAG preencha agência (4 dígitos) e conta com dígito (12345-6)." className="sm:col-span-2" />
        <Select
          label="Tipo *"
          name="tipo"
          defaultValue={conta?.tipo ?? "BANCO"}
          options={[
            { value: "BANCO", label: "Conta bancária" },
            { value: "CAIXA", label: "Caixa" },
          ]}
          placeholder=""
        />
        <Field label="Banco" name="banco" defaultValue={conta?.banco ?? ""} maxLength={60} />
        <Field label="Agência" name="agencia" defaultValue={conta?.agencia ?? ""} maxLength={20} />
        <Field label="Número da conta" name="numero" defaultValue={conta?.numero ?? ""} maxLength={30} />
        <Field label="Titular — CNPJ" name="titularCnpj" defaultValue={conta?.titularCnpj ?? ""} hint="Empresa debitada nos pagamentos SISPAG" />
        <Field label="Titular — razão social" name="titularNome" defaultValue={conta?.titularNome ?? ""} maxLength={60} />
        <Field label="Saldo inicial (R$)" name="saldoInicial" type="number" step="0.01" defaultValue={conta ? conta.saldoInicial.toFixed(2) : "0.00"} hint="Saldo antes do primeiro lançamento no sistema" />
      </Grid>
    </Form>
  );
}
