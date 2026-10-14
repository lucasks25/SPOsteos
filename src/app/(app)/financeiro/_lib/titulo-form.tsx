import { Field, Form, Grid, Select } from "@/components/form";
import { inputDate, money } from "@/lib/format";
import { CATEGORIAS_PAGAR, FORMAS_PAGAMENTO, TIPOS, type Tipo, type TituloRow } from "./config";
import { baixarTitulo, salvarTitulo } from "./actions";
import { linhaDigitavel } from "./boleto";
import { ymd } from "./datas";

/** Formulário de criação/edição manual de título (somente em aberto). */
export function TituloForm({ tipo, titulo, parceiros }: { tipo: Tipo; titulo?: TituloRow; parceiros: { value: string; label: string }[] }) {
  const cfg = TIPOS[tipo];
  const t = titulo;
  const categorias: string[] = [...CATEGORIAS_PAGAR];
  if (t?.categoria && !categorias.includes(t.categoria)) categorias.push(t.categoria);
  return (
    <Form action={salvarTitulo.bind(null, tipo, t?.id ?? null)} submitLabel={t ? "Salvar alterações" : "Criar título"}>
      <Grid cols={3}>
        <Field label="Descrição *" name="descricao" defaultValue={t?.descricao} required maxLength={200} className="sm:col-span-2" />
        <Select
          label={cfg.parceiro}
          name={tipo === "receber" ? "hospitalId" : "fornecedorId"}
          defaultValue={t?.parceiroId ?? ""}
          options={parceiros}
          placeholder="(nenhum)"
        />
        {tipo === "pagar" && (
          <Select label="Categoria" name="categoria" defaultValue={t?.categoria ?? ""} options={categorias.map((c) => ({ value: c, label: c }))} placeholder="(sem categoria)" />
        )}
        <Field label="Valor (R$) *" name="valor" type="number" step="0.01" min="0.01" defaultValue={t ? t.valor.toFixed(2) : ""} required />
        <Field label="Vencimento *" name="vencimento" type="date" defaultValue={inputDate(t?.vencimento)} required />
        {tipo === "pagar" && (
          <Field
            label="Boleto do fornecedor (linha digitável)"
            name="codigoBarras"
            defaultValue={t?.codigoBarras ? linhaDigitavel(t.codigoBarras) : ""}
            className="sm:col-span-3"
            hint="Opcional. Com boleto, o SISPAG paga pelo código de barras; sem boleto, por TED/Pix para a conta do fornecedor."
          />
        )}
      </Grid>
    </Form>
  );
}

/** Baixa do título: valor (padrão = saldo), data (padrão = hoje), conta e forma. Aceita pagamento parcial. */
export function BaixaForm({ tipo, titulo, hoje, contas }: { tipo: Tipo; titulo: TituloRow; hoje: Date; contas: { value: string; label: string }[] }) {
  return (
    <Form action={baixarTitulo.bind(null, tipo, titulo.id)} submitLabel={TIPOS[tipo].baixaLabel}>
      <Grid cols={4}>
        <Field
          label={`Valor ${TIPOS[tipo].pagoLabel.toLowerCase()} (R$) *`}
          name="valor"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={titulo.saldo.toFixed(2)}
          hint={`Dinheiro que ${tipo === "receber" ? "entra" : "sai"} na conta. Saldo do título: ${money(titulo.saldo)}. Menor que o saldo = baixa parcial.`}
          required
        />
        <Field label="Juros (R$)" name="juros" type="number" step="0.01" min="0" hint="Incluído no valor acima" />
        <Field label="Multa (R$)" name="multa" type="number" step="0.01" min="0" hint="Incluída no valor acima" />
        <Field label="Desconto (R$)" name="desconto" type="number" step="0.01" min="0" hint="Quita parte do título sem dinheiro" />
        <Field label="Data *" name="data" type="date" defaultValue={ymd(hoje)} max={ymd(hoje)} required />
        <Select
          label="Conta *"
          name="contaId"
          options={contas}
          defaultValue={contas.length === 1 ? contas[0].value : ""}
          placeholder="Selecione..."
          required
        />
        <Select label="Forma" name="forma" options={FORMAS_PAGAMENTO.map((f) => ({ value: f.value, label: f.label }))} placeholder="(não informada)" />
      </Grid>
    </Form>
  );
}
