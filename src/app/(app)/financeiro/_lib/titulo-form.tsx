import { Field, Form, Grid, Select } from "@/components/form";
import { TokenFormulario } from "@/components/token-formulario";
import { inputDate, money } from "@/lib/format";
import { FORMAS_PAGAMENTO, TIPOS, type Tipo, type TituloRow } from "./config";
import { baixarTitulo, classificarTitulo, glosarTitulo, salvarTitulo } from "./actions";
import { linhaDigitavel } from "./boleto";
import { ymd } from "@/lib/datas";
import { CATEGORIAS_GLOSA, ROTULO_CATEGORIA_GLOSA } from "./glosa-categorias";

/** Formulário de criação/edição manual de título (somente em aberto). */
export function TituloForm({
  tipo,
  titulo,
  parceiros,
  planos,
  centros,
  hoje,
}: {
  tipo: Tipo;
  titulo?: TituloRow;
  parceiros: { value: string; label: string }[];
  planos: { value: string; label: string }[];
  centros: { value: string; label: string }[];
  hoje: Date;
}) {
  const cfg = TIPOS[tipo];
  const t = titulo;
  return (
    <Form action={salvarTitulo.bind(null, tipo, t?.id ?? null)} submitLabel={t ? "Salvar alterações" : "Criar título"} submitVariant={t ? "secondary" : "primary"} cancelarHref={t ? undefined : cfg.path}>
      {!t && <TokenFormulario />}
      <Grid cols={3}>
        <Field label="Descrição *" name="descricao" defaultValue={t?.descricao} required maxLength={200} className="sm:col-span-2" />
        <Select
          label={cfg.parceiro}
          name={tipo === "receber" ? "hospitalId" : "fornecedorId"}
          defaultValue={t?.parceiroId ?? ""}
          options={parceiros}
          placeholder="(nenhum)"
        />
        <Select label="Conta do plano *" name="planoContaId" defaultValue={t?.planoContaId ?? ""} options={planos} placeholder="Selecione..." required />
        <Select label="Centro de custo" name="centroCustoId" defaultValue={t?.centroCustoId ?? ""} options={centros} placeholder="(nenhum)" />
        <Field label="Competência *" name="competencia" type="date" defaultValue={inputDate(t?.competencia ?? hoje)} required hint="Dia a que a receita ou despesa pertence (o DRE usa esta data, não o vencimento)." />
        <Field label="Valor (R$) *" name="valor" type="number" step="0.01" min="0.01" defaultValue={t ? t.valor.toFixed(2) : ""} required />
        <Field label="Vencimento *" name="vencimento" type="date" defaultValue={inputDate(t?.vencimento)} required />
        {tipo === "pagar" && (
          <Field
            label="Boleto do fornecedor (linha digitável)"
            name="codigoBarras"
            defaultValue={t?.codigoBarras ? linhaDigitavel(t.codigoBarras) : ""}
            className="sm:col-span-3"
            hint="Opcional. Com boleto, o SISPAG paga pelo código de barras; sem boleto, por TED/Pix para a conta do fornecedor. O valor e o vencimento do boleto têm de ser os do título."
          />
        )}
      </Grid>
    </Form>
  );
}

/** Baixa do título: valor (padrão = saldo), data (padrão = hoje), conta e forma. Aceita pagamento parcial. */
export function BaixaForm({ tipo, titulo, hoje, contas }: { tipo: Tipo; titulo: TituloRow; hoje: Date; contas: { value: string; label: string }[] }) {
  return (
    <Form action={baixarTitulo.bind(null, tipo, titulo.id)} submitLabel={TIPOS[tipo].baixaLabel} resetOnSuccess>
      <TokenFormulario />
      <Grid cols={4}>
        <Field
          label={`Valor ${TIPOS[tipo].pagoLabel.toLowerCase()} (R$) *`}
          name="valor"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={titulo.saldo.toFixed(2)}
          hint={`Saldo do título: ${money(titulo.saldo)}. Menor que o saldo = baixa parcial.`}
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

/** Classificação do título para o DRE (conta do plano, centro de custo e competência); vale em qualquer situação. */
export function ClassificarForm({
  tipo,
  titulo,
  planos,
  centros,
}: {
  tipo: Tipo;
  titulo: TituloRow;
  planos: { value: string; label: string }[];
  centros: { value: string; label: string }[];
}) {
  return (
    <Form action={classificarTitulo.bind(null, tipo, titulo.id)} submitLabel="Salvar classificação" submitVariant="secondary">
      <Grid cols={3}>
        <Select label="Conta do plano *" name="planoContaId" defaultValue={titulo.planoContaId ?? ""} options={planos} placeholder="Selecione..." required />
        <Select label="Centro de custo" name="centroCustoId" defaultValue={titulo.centroCustoId ?? ""} options={centros} placeholder="(nenhum)" />
        <Field label="Competência *" name="competencia" type="date" defaultValue={inputDate(titulo.competencia)} required />
      </Grid>
    </Form>
  );
}

/** Glosa: parte da cobrança que o hospital não reconhece. Abate o saldo sem dinheiro e vai para Deduções no DRE. */
export function GlosaForm({ titulo, hoje }: { titulo: TituloRow; hoje: Date }) {
  return (
    <Form action={glosarTitulo.bind(null, titulo.id)} submitLabel="Registrar glosa" submitVariant="secondary" resetOnSuccess>
      <Grid cols={3}>
        <Select label="Categoria *" name="categoria" required options={CATEGORIAS_GLOSA.map((c) => ({ value: c, label: ROTULO_CATEGORIA_GLOSA[c] }))} />
        <Field label="Valor glosado (R$) *" name="valor" type="number" step="0.01" min="0.01" max={titulo.saldo.toFixed(2)} required hint={`Saldo do título: ${money(titulo.saldo)}`} />
        <Field label="Data *" name="data" type="date" defaultValue={ymd(hoje)} max={ymd(hoje)} required />
        <Field label="Motivo *" name="motivo" required minLength={5} maxLength={200} hint="Ex.: item não autorizado pelo convênio" />
      </Grid>
    </Form>
  );
}
