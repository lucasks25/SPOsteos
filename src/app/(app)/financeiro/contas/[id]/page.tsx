import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { Badge, Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { alternarAtivoConta, estornarTransferenciaAction, excluirAvulso, lancarAvulso } from "../../_lib/contas-actions";
import { listarContas } from "../../_lib/contas";
import { hojeUTC, ymd } from "@/lib/datas";
import { opcoesClassificacao } from "../../_lib/plano";
import { ContaForm } from "../conta-form";

export default async function ContaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  const conta = (await listarContas()).find((c) => c.id === id);
  if (!conta) notFound();
  const movimentos = await db.lancamento.findMany({
    where: { contaId: id },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    take: 100,
    include: { extrato: { select: { id: true } }, contaReceber: { select: { id: true } }, contaPagar: { select: { id: true } } },
  });
  const hoje = hojeUTC();
  const cx = await db.contaBancaria.findUnique({ where: { id }, select: { carteiraCobranca: true, cobrancaMultaPercent: true, cobrancaJurosMensalPercent: true } });
  const extra = { carteiraCobranca: cx?.carteiraCobranca ?? null, cobrancaMultaPercent: toNumber(cx?.cobrancaMultaPercent ?? 2), cobrancaJurosMensalPercent: toNumber(cx?.cobrancaJurosMensalPercent ?? 1) };
  const { planos, centros } = await opcoesClassificacao(db);

  return (
    <>
      <PageHeader
        voltar={{ href: "/financeiro/contas", label: "Contas bancárias" }}
        title={conta.nome}
        subtitle={[conta.banco, conta.agencia, conta.numero].filter(Boolean).join(" / ") || undefined}
        actions={
          <>
            {!conta.ativo && <Badge>inativa</Badge>}
            <ActionButton action={alternarAtivoConta.bind(null, id)} confirm={conta.ativo ? `Inativar a conta ${conta.nome}? Ela deixa de aparecer para novas baixas, transferências e lançamentos; o histórico é mantido.` : undefined}>{conta.ativo ? "Inativar" : "Ativar"}</ActionButton>
          </>
        }
      />
      <KpiGrid>
        <Stat icon="banco" label="Saldo" value={money(conta.saldo)} tone={conta.saldo < 0 ? "danger" : "default"} />
        <Stat icon="banco" label="Saldo inicial" value={money(conta.saldoInicial)} />
        <Stat icon="receber" label="Entradas" value={money(conta.entradas)} />
        <Stat icon="pagar" label="Saídas" value={money(conta.saidas)} />
      </KpiGrid>

      <div className="space-y-4">
        <Table titulo="Movimentos (últimos 100)" icone="lista" contagem={movimentos.length} head={["Data", "Descrição", "Origem", "Entrada", "Saída", "Conciliação", ""]} empty={movimentos.length === 0} emptyText="Nenhum movimento nesta conta. Baixe um título ou faça um lançamento avulso abaixo.">
            {movimentos.map((m) => {
              const tituloHref = m.contaReceberId ? `/financeiro/receber/${m.contaReceberId}` : m.contaPagarId ? `/financeiro/pagar/${m.contaPagarId}` : null;
              return (
                <tr key={m.id}>
                  <Td>{date(m.data)}</Td>
                  <Td className="max-w-xs truncate font-medium">{m.descricao}</Td>
                  <Td>
                    {tituloHref ? (
                      <Link href={tituloHref} className="text-teal-700 hover:underline">
                        título
                      </Link>
                    ) : m.transferenciaId ? (
                      "transferência"
                    ) : (
                      (m.categoria ?? "avulso")
                    )}
                  </Td>
                  <Td className="text-right tnum text-emerald-700">{m.sentido === "ENTRADA" ? money(toNumber(m.valor)) : ""}</Td>
                  <Td className="text-right tnum text-rose-600">{m.sentido === "SAIDA" ? money(toNumber(m.valor)) : ""}</Td>
                  <Td>{m.extrato ? <Badge color="green">conciliado</Badge> : <Badge>pendente</Badge>}</Td>
                  <Td>
                    {m.transferenciaId && (
                      <ActionButton variant="small" action={estornarTransferenciaAction} hidden={{ id: m.transferenciaId }} confirm={`Estornar a transferência de ${money(toNumber(m.valor))} de ${date(m.data)} (${m.descricao})? As duas contas voltam ao saldo anterior.`}>
                        Estornar
                      </ActionButton>
                    )}
                    {!tituloHref && !m.transferenciaId && !m.extrato && (
                      <ActionButton variant="small" action={excluirAvulso} hidden={{ id: m.id }} confirm={`Excluir o lançamento "${m.descricao}" de ${money(toNumber(m.valor))} em ${date(m.data)}?`}>
                        Excluir
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              );
            })}
        </Table>

        {conta.ativo && (
          <Card title="Lançamento avulso (tarifa, rendimento, outros)" icon="mais">
            <p className="mb-3 text-sm text-slate-600">
              Para mover dinheiro entre contas use <Link href="/financeiro/contas" className="font-semibold text-teal-700 hover:underline">Transferência</Link>.
            </p>
            <Form action={lancarAvulso.bind(null, id)} submitLabel="Lançar" submitVariant="secondary" resetOnSuccess>
              <Grid cols={4}>
                <Select
                  label="Tipo *"
                  name="sentido"
                  options={[
                    { value: "ENTRADA", label: "Entrada" },
                    { value: "SAIDA", label: "Saída" },
                  ]}
                  placeholder="Selecione..."
                  required
                />
                <Field label="Descrição *" name="descricao" required maxLength={200} className="sm:col-span-2" />
                <Select label="Conta do plano *" name="planoContaId" options={planos} placeholder="Selecione..." required />
                <Select label="Centro de custo" name="centroCustoId" options={centros} placeholder="(nenhum)" />
                <Field label="Valor (R$) *" name="valor" type="number" step="0.01" min="0.01" required />
                <Field label="Data *" name="data" type="date" defaultValue={ymd(hoje)} max={ymd(hoje)} required />
              </Grid>
            </Form>
          </Card>
        )}

        <Card title="Dados da conta" icon="engrenagem">
          <ContaForm conta={{ ...conta, ...extra }} />
        </Card>
      </div>
    </>
  );
}
