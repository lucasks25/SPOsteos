import { Field, Form, Grid, Select } from "@/components/form";
import { inputDate } from "@/lib/format";
import type { Produto } from "@/generated/prisma/client";
import { salvarProduto } from "./actions";

export function ProdutoForm({ produto, fabricantes, podePreco = false }: { produto?: Produto; fabricantes: { id: string; nome: string }[]; podePreco?: boolean }) {
  const p = produto;
  return (
    <Form action={salvarProduto.bind(null, p?.id ?? null)} redirectTo="/cadastros/produtos">
      <Grid cols={3}>
        <Field label="Código *" name="codigo" defaultValue={p?.codigo} required />
        <Field label="Descrição *" name="descricao" defaultValue={p?.descricao} required className="sm:col-span-2" />
        <Field label="Referência do fabricante" name="referencia" defaultValue={p?.referencia ?? ""} />
        <Select label="Fabricante" name="fabricanteId" defaultValue={p?.fabricanteId ?? ""} options={fabricantes.map((f) => ({ value: f.id, label: f.nome }))} />
        <Field label="Unidade *" name="unidade" defaultValue={p?.unidade ?? "UN"} required />
        <Field label="Registro ANVISA" name="registroAnvisa" defaultValue={p?.registroAnvisa ?? ""} />
        <Field label="Validade do registro" name="validadeRegistro" type="date" defaultValue={inputDate(p?.validadeRegistro)} />
        <Select label="Classe de risco" name="classeRisco" defaultValue={p?.classeRisco ?? ""} options={["I", "II", "III", "IV"].map((c) => ({ value: c, label: `Classe ${c}` }))} />
        <Field label="GTIN (UDI-GS1)" name="gtin" defaultValue={p?.gtin ?? ""} />
        <Field label="NCM" name="ncm" defaultValue={p?.ncm ?? ""} />
        <Field label="Preço base (R$)" name="precoBase" type="number" step="0.01" min="0" defaultValue={p ? p.precoBase.toString() : "0"} disabled={!podePreco} hint={podePreco ? undefined : "Só o comercial altera o preço"} />
        <Field label="Estoque mínimo" name="estoqueMinimo" type="number" min="0" defaultValue={p?.estoqueMinimo ?? 0} />
      </Grid>
      <div className="flex gap-6">
        <Field label="Controla lote/validade" name="controlaLote" type="checkbox" defaultChecked={p?.controlaLote ?? true} />
        <Field label="Ativo" name="ativo" type="checkbox" defaultChecked={p?.ativo ?? true} />
      </div>
    </Form>
  );
}
