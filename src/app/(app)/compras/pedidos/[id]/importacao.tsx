import Link from "next/link";
import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { Badge, btn, Card, Dl, KpiGrid, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { date, inputDate, money, toNumber } from "@/lib/format";
import { CRITERIOS_RATEIO, INCOTERMS, MOEDAS, reais, ROTULO_CRITERIO, ROTULO_DESPESA, TIPOS_DESPESA, type ResultadoCusto } from "../../_lib/custo-importacao";
import { cambioDo, custoDoPedido } from "../../_lib/importacao-servico";
import { removerDespesa, salvarDespesa, salvarImportacao, salvarItensImportacao } from "../importacao-actions";
import { TokenFormulario } from "@/components/token-formulario";

type Props = { pedidoId: number; editarDespesaId?: string; verFinanceiro?: boolean };

const fmtMoeda = (moeda: string, v: number, casas = 2) =>
  moeda === "BRL" ? money(v) : `${moeda} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: casas })}`;
const fmtUnit = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Seção de importação do detalhe do pedido: dados, preços na moeda, despesas e custo nacionalizado por item. */
export async function SecaoImportacao({ pedidoId, editarDespesaId, verFinanceiro = false }: Props) {
  const [pedido, fornecedores] = await Promise.all([
    db.pedidoCompra.findUniqueOrThrow({
      where: { id: pedidoId },
      include: {
        itens: { orderBy: { id: "asc" }, include: { produto: { select: { codigo: true, descricao: true, precoBase: true, custoMedio: true } } } },
        despesas: { orderBy: { criadoEm: "asc" }, include: { contaPagar: { select: { id: true, status: true, vencimento: true, fornecedorId: true } }, item: { select: { produto: { select: { codigo: true } } } } } },
      },
    }),
    db.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
  ]);
  const travado = pedido.itens.some((i) => i.recebido > 0);
  const editavel = !travado && pedido.status !== "CANCELADO";
  const moeda = pedido.moeda;
  const cambio = cambioDo(pedido);

  let calc: ResultadoCusto | null = null;
  let erroCalculo: string | null = null;
  try {
    calc = custoDoPedido(pedido);
  } catch (e) {
    if (!(e instanceof ErroNegocio)) throw e;
    erroCalculo = e.message;
  }
  const linhaDe = new Map(calc?.linhas.map((l) => [l.id, l]) ?? []);
  const itemOpts = pedido.itens.map((i) => ({ value: i.id, label: `${i.produto.codigo} — ${i.produto.descricao}` }));
  const fornOpts = fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }));
  const emEdicao = editarDespesaId ? pedido.despesas.find((d) => d.id === editarDespesaId) : undefined;
  const contaAtiva = emEdicao?.contaPagar && emEdicao.contaPagar.status !== "CANCELADO" ? emEdicao.contaPagar : null;
  const fator = calc && calc.totalMercadoriaCent > 0 ? calc.totalCent / calc.totalMercadoriaCent : null;

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Stat label="Mercadoria em reais" value={calc ? money(reais(calc.totalMercadoriaCent)) : "—"} hint={moeda === "BRL" ? "pedido em reais" : `câmbio ${cambio.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}`} />
        <Stat label="Despesas no custo" value={calc ? money(reais(calc.totalRateadoCent)) : "—"} hint="rateadas entre os itens" />
        <Stat label="Fora do custo" value={calc ? money(reais(calc.naoIntegraCent)) : "—"} hint="tributos recuperáveis e similares" />
        <Stat label="Custo nacionalizado" value={calc ? money(reais(calc.totalCent)) : "—"} hint={fator ? `fator ${fator.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} × mercadoria` : undefined} />
      </KpiGrid>

      <Card title="Importação" actions={travado ? <Badge color="yellow">câmbio e despesas travados (já recebido)</Badge> : undefined}>
        <Form action={salvarImportacao.bind(null, pedido.id)} submitLabel={pedido.status === "CANCELADO" ? null : "Salvar dados da importação"}>
          <Grid cols={4}>
            {travado ? (
              <>
                <input type="hidden" name="moeda" value={moeda} />
                <input type="hidden" name="cambio" value={pedido.cambio?.toString() ?? ""} />
                <Dl items={[["Moeda", moeda], ["Câmbio", moeda === "BRL" ? "—" : cambio.toLocaleString("pt-BR", { maximumFractionDigits: 6 })]]} />
              </>
            ) : (
              <>
                <Select label="Moeda *" name="moeda" options={MOEDAS.map((m) => ({ value: m, label: m }))} defaultValue={moeda} placeholder="" required />
                <Field label="Câmbio (R$ por 1 unidade)" name="cambio" type="number" min={0.000001} step="0.000001" defaultValue={pedido.cambio?.toString() ?? ""} hint="Obrigatório fora de BRL" />
              </>
            )}
            <Select label="Tipo de câmbio" name="tipoCambio" options={[{ value: "PTAX", label: "PTAX (registro da DI)" }, { value: "CONTRATADO", label: "Contratado (fechamento)" }]} defaultValue={pedido.tipoCambio ?? ""} placeholder="—" />
            <Select label="Incoterm" name="incoterm" options={INCOTERMS.map((m) => ({ value: m, label: m }))} defaultValue={pedido.incoterm ?? ""} placeholder="—" />
            <Field label="Invoice" name="invoice" maxLength={60} defaultValue={pedido.invoice ?? ""} />
            <Field label="Data da invoice" name="dataInvoice" type="date" defaultValue={inputDate(pedido.dataInvoice)} />
            <Field label="Nº da DI / DUIMP" name="numeroDi" maxLength={30} defaultValue={pedido.numeroDi ?? ""} />
            <Field label="Registro da DI" name="dataRegistroDi" type="date" defaultValue={inputDate(pedido.dataRegistroDi)} />
            <Field label="Desembaraço" name="dataDesembaraco" type="date" defaultValue={inputDate(pedido.dataDesembaraco)} />
          </Grid>
        </Form>
      </Card>

      {editavel && (
        <Card title={`Preços na moeda (${moeda}) e pesos`}>
          <Form action={salvarItensImportacao.bind(null, pedido.id)} submitLabel="Salvar preços e pesos">
            <div className="space-y-3">
              {pedido.itens.map((i) => (
                <Grid key={i.id} cols={3}>
                  <div className="self-end pb-2 text-sm text-slate-800">
                    {i.produto.codigo} — {i.produto.descricao} <span className="text-slate-500">({i.quantidade} un.)</span>
                  </div>
                  <Field label={`Preço unitário (${moeda}) *`} name={`pm_${i.id}`} type="number" min={0} step="0.0001" defaultValue={i.precoMoeda?.toString() ?? ""} required />
                  <Field label="Peso líquido da linha (kg)" name={`kg_${i.id}`} type="number" min={0} step="0.001" defaultValue={i.pesoKg?.toString() ?? ""} hint="Só para rateio por peso" />
                </Grid>
              ))}
            </div>
          </Form>
        </Card>
      )}

      <Table
        titulo="Despesas e tributos da importação"

        contagem={pedido.despesas.length}
        head={["Tipo", "Valor", "Custo", "Rateio", "Conta a pagar", ""]}
        empty={pedido.despesas.length === 0}
        emptyText="Nenhuma despesa lançada. Inclua frete, seguro, II, despachante etc. antes do primeiro recebimento."
      >
        {pedido.despesas.map((d) => (
          <tr key={d.id}>
            <Td>
              <div className="font-medium">{ROTULO_DESPESA[d.tipo]}</div>
              {d.descricao && <div className="text-xs text-slate-500">{d.descricao}</div>}
            </Td>
            <Td className="tnum text-right">{money(toNumber(d.valor))}</Td>
            <Td>{d.integraCusto ? <Badge color="teal">integra o custo</Badge> : <Badge>fora do custo</Badge>}</Td>
            <Td>
              <div>{d.integraCusto ? ROTULO_CRITERIO[d.criterio] : "—"}</div>
              {d.item && <div className="text-xs text-slate-500">só {d.item.produto.codigo}</div>}
            </Td>
            <Td>
              {d.contaPagar ? (
                verFinanceiro ? (
                  <Link href={`/financeiro/pagar/${d.contaPagar.id}`} className="inline-flex items-center gap-2 text-teal-700 hover:underline" title="Ver no Financeiro">
                    {date(d.contaPagar.vencimento)} <StatusBadge status={d.contaPagar.status} />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {date(d.contaPagar.vencimento)} <StatusBadge status={d.contaPagar.status} />
                  </span>
                )
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </Td>
            <Td className="text-right">
              {editavel && (
                <div className="inline-flex items-start gap-1">
                  <Link href={`/compras/pedidos/${pedido.id}?despesa=${d.id}#despesa`} className={btn.small}>
                    Editar
                  </Link>
                  <ActionButton action={removerDespesa.bind(null, pedido.id, d.id)} variant="danger" confirm="Remover esta despesa? A conta a pagar dela, se houver, será cancelada.">
                    Remover
                  </ActionButton>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      {editavel && (
        <div id="despesa">
          <Card title={emEdicao ? `Editar despesa: ${ROTULO_DESPESA[emEdicao.tipo]}` : "Incluir despesa"} actions={emEdicao ? <Link href={`/compras/pedidos/${pedido.id}`} className={btn.small}>Cancelar edição</Link> : undefined}>
            <Form key={emEdicao?.id ?? "nova"} action={salvarDespesa.bind(null, pedido.id, emEdicao?.id ?? null)} submitLabel={emEdicao ? "Salvar despesa" : "Incluir despesa"} redirectTo={emEdicao ? `/compras/pedidos/${pedido.id}` : undefined} resetOnSuccess={!emEdicao}>
              <TokenFormulario />
              <Grid cols={4}>
                <Select label="Tipo *" name="tipo" options={TIPOS_DESPESA.map((t) => ({ value: t, label: ROTULO_DESPESA[t] }))} defaultValue={emEdicao?.tipo ?? ""} required />
                <Field label="Valor em reais *" name="valor" type="number" min={0} step="0.01" defaultValue={emEdicao ? toNumber(emEdicao.valor) : ""} required />
                <Select
                  label="Integra o custo do produto?"
                  name="integra"
                  options={[
                    ...(emEdicao ? [] : [{ value: "PADRAO", label: "Padrão do tipo (tributo recuperável: não)" }]),
                    { value: "SIM", label: "Sim — vai ao estoque e ao custo médio" },
                    { value: "NAO", label: "Não — recuperável ou despesa do mês" },
                  ]}
                  defaultValue={emEdicao ? (emEdicao.integraCusto ? "SIM" : "NAO") : "PADRAO"}
                  placeholder=""
                />
                <Select label="Critério de rateio" name="criterio" options={CRITERIOS_RATEIO.map((c) => ({ value: c, label: ROTULO_CRITERIO[c] }))} defaultValue={emEdicao?.criterio ?? "VALOR"} placeholder="" />
                <Select label="Aplicar a" name="itemId" options={itemOpts} defaultValue={emEdicao?.itemId ?? ""} placeholder="Todos os itens" hint="Ex.: II de uma adição (NCM) só deste item" />
                <Field label="Descrição" name="descricao" maxLength={120} defaultValue={emEdicao?.descricao ?? ""} />
                <Field label="Gerar conta a pagar" name="gerarConta" type="checkbox" defaultChecked={!!contaAtiva} className="self-end pb-2" />
                <Select label="Favorecido (fornecedor)" name="fornecedorId" options={fornOpts} defaultValue={contaAtiva?.fornecedorId ?? ""} placeholder="—" />
                <Field label="Vencimento" name="vencimento" type="date" defaultValue={inputDate(contaAtiva?.vencimento)} hint="Obrigatório se gerar conta" />
              </Grid>
            </Form>
          </Card>
        </div>
      )}

      <Table
        titulo="Custo nacionalizado por item"

        contagem={pedido.itens.length}
        head={["Produto", "Qtd.", `Preço (${moeda})`, "Em reais (un.)", "Rateio (un.)", "Custo unit. final", "Preço base", "Margem s/ preço base"]}
        empty={!calc}
        emptyText={erroCalculo ?? "Sem dados para calcular."}
      >
        {calc &&
          pedido.itens.map((i) => {
            const l = linhaDe.get(i.id)!;
            const base = toNumber(i.produto.precoBase);
            const margem = base > 0 ? (base - l.custoUnit) / base : null;
            return (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium">{i.produto.codigo}</div>
                  <div className="text-xs text-slate-500">{i.produto.descricao}</div>
                </Td>
                <Td className="tnum text-right">{i.quantidade}</Td>
                <Td className="tnum text-right">
                  <div>{fmtMoeda(moeda, l.precoMoeda, 4)}</div>
                  <div className="text-xs text-slate-500">total {fmtMoeda(moeda, l.valorMoeda, 4)}</div>
                </Td>
                <Td className="tnum text-right">{fmtUnit(l.valorReaisCent / 100 / i.quantidade)}</Td>
                <Td className="tnum text-right">
                  <div>{fmtUnit(l.rateioCent / 100 / i.quantidade)}</div>
                  <div className="text-xs text-slate-500">linha {money(reais(l.rateioCent))}</div>
                </Td>
                <Td className="tnum text-right font-semibold">
                  <div>{fmtUnit(l.custoUnit)}</div>
                  <div className="text-xs font-normal text-slate-500">linha {money(reais(l.totalCent))}</div>
                </Td>
                <Td className="tnum text-right">{base > 0 ? money(base) : "—"}</Td>
                <Td className="tnum text-right">
                  {margem === null ? "—" : <Badge color={margem < 0 ? "red" : margem < 0.2 ? "yellow" : "green"}>{(margem * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</Badge>}
                </Td>
              </tr>
            );
          })}
        {calc && (
          <tr className="bg-slate-50 font-semibold">
            <Td>Total</Td>
            <Td />
            <Td />
            <Td className="tnum text-right">{money(reais(calc.totalMercadoriaCent))}</Td>
            <Td className="tnum text-right">{money(reais(calc.totalRateadoCent))}</Td>
            <Td className="tnum text-right">{money(reais(calc.totalCent))}</Td>
            <Td />
            <Td />
          </tr>
        )}
      </Table>
      <p className="text-xs text-slate-600">
        O recebimento usa o custo unitário final no kardex e no custo médio; a conta a pagar do fornecedor sai só pela mercadoria (preço × câmbio). Despesas que integram o custo
        vão ao plano &quot;Estoque&quot; (fora do resultado, entram no DRE pelo CMV na venda); tributos recuperáveis fora do custo vão a &quot;Tributos a recuperar&quot;; outras despesas fora do custo vão a &quot;Fretes e custos de importação&quot;.
      </p>
    </div>
  );
}
