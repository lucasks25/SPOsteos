import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, Field, Form, Grid } from "@/components/form";
import { Card, Dl, KpiGrid, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, inputDate, money, toNumber } from "@/lib/format";
import { cancelarPedidoVenda, registrarNf } from "../actions";
import { riscoGlosaDaCirurgia } from "../../_lib/autorizacao-servico";
import { PainelAchados, textoAvisoFaturamento } from "../../_lib/autorizacao-view";

const DIA = 86_400_000;

export default async function PedidoVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const verFinanceiro = user.perfil === "FINANCEIRO" || user.perfil === "ADMIN";
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();
  const pedido = await db.pedidoVenda.findUnique({
    where: { id },
    include: {
      hospital: { select: { id: true, razaoSocial: true, nomeFantasia: true, prazoPagamentoDias: true } },
      cirurgia: { select: { id: true, numero: true } },
      representante: { select: { nome: true } },
      itens: { include: { produto: { select: { codigo: true, descricao: true } } }, orderBy: { id: "asc" } },
      contasReceber: { select: { id: true, valor: true, vencimento: true, status: true } },
    },
  });
  if (!pedido) notFound();
  const total = toNumber(pedido.total);
  const custo = toNumber(pedido.custoTotal);
  const margem = total - custo;
  const risco = pedido.cirurgia && pedido.status === "ABERTO" ? await riscoGlosaDaCirurgia(pedido.cirurgia.id) : null;
  const prazo = pedido.hospital.prazoPagamentoDias ?? 30;
  const venc = new Date(new Date(new Date().toISOString().slice(0, 10)).getTime() + prazo * DIA);

  return (
    <>
      <PageHeader
        title={`PV-${pedido.id}`}
        subtitle={`${pedido.hospital.nomeFantasia || pedido.hospital.razaoSocial} · pedido de venda gerado ao faturar a cirurgia. O Comercial registra a nota fiscal; o Financeiro cuida da cobrança.`}
        actions={
          <>
            <StatusBadge status={pedido.status} />
            {pedido.status === "ABERTO" && (
              <ActionButton action={cancelarPedidoVenda.bind(null, pedido.id)} variant="danger" confirm="Cancelar este pedido? A cirurgia volta para “realizada” e pode ser faturada de novo.">
                Cancelar pedido
              </ActionButton>
            )}
          </>
        }
      />
      <KpiGrid>
        <Stat label="Total" value={money(total)} />
        <Stat label="Custo" value={money(custo)} />
        <Stat label="Margem" value={money(margem)} hint={total > 0 ? `${((margem / total) * 100).toFixed(1)}%` : undefined} tone={margem < 0 ? "danger" : "default"} />
        <Stat label="Comissão" value={money(toNumber(pedido.comissao))} hint={pedido.representante?.nome} />
      </KpiGrid>

      <div className="space-y-6">
        <Card title="Dados do pedido" icon="carrinho">
          <Dl
            items={[
              ["Hospital", <Link key="h" href={`/cadastros/hospitais/${pedido.hospital.id}`} className="text-teal-700 hover:underline">{pedido.hospital.razaoSocial}</Link>],
              ["Cirurgia", pedido.cirurgia ? <Link key="c" href={`/comercial/cirurgias/${pedido.cirurgia.id}`} className="text-teal-700 hover:underline">CIR-{pedido.cirurgia.numero}</Link> : "—"],
              ["Nota fiscal", pedido.numeroNf],
              ["Faturado em", date(pedido.faturadoEm)],
              ["Criado em", date(pedido.criadoEm)],
              ["Prazo do hospital", `${prazo} dias`],
            ]}
          />
        </Card>

        <Table titulo="Itens" icone="lista" contagem={pedido.itens.length} head={["Produto", "Lote", "Qtd.", "Preço unit.", "Subtotal"]} empty={pedido.itens.length === 0} emptyText="Este pedido não tem itens.">
          {pedido.itens.map((i) => (
            <tr key={i.id}>
              <Td>
                <div className="font-medium">{i.produto.descricao}</div>
                <div className="font-mono text-[11px] text-slate-500">{i.produto.codigo}</div>
              </Td>
              <Td>{i.loteNumero ?? "—"}</Td>
              <Td className="tnum text-right">{i.quantidade}</Td>
              <Td className="tnum text-right">{money(toNumber(i.precoUnit))}</Td>
              <Td className="tnum text-right font-semibold">{money(i.quantidade * toNumber(i.precoUnit))}</Td>
            </tr>
          ))}
        </Table>

        {pedido.status === "ABERTO" && (
          <Card title="Registrar nota fiscal" icon="documento">
            <p className="mb-3 text-sm text-slate-600">A emissão da NF-e ainda é feita fora do sistema. Informe o número para faturar e gerar a conta a receber.</p>
            {risco?.grave && (
              <div className="mb-3 space-y-2">
                <p className="text-sm font-medium text-rose-700">Risco de glosa: a autorização do convênio não cobre o material desta cirurgia. Você pode registrar a NF mesmo assim; o sistema pedirá confirmação.</p>
                <PainelAchados risco={risco} />
              </div>
            )}
            <Form action={registrarNf.bind(null, pedido.id)} submitLabel="Registrar NF e gerar conta a receber" confirm={risco?.grave ? textoAvisoFaturamento(risco.achados, "registrar a NF") : undefined}>
              <Grid cols={3}>
                <Field label="Número da NF *" name="numeroNf" required maxLength={30} />
                <Field label="Vencimento *" name="vencimento" type="date" defaultValue={inputDate(venc)} required hint={`Hoje + ${prazo} dias (prazo do hospital)`} />
              </Grid>
            </Form>
          </Card>
        )}

        {pedido.contasReceber.length > 0 && (
          <Table titulo="Contas a receber" icone="receber" contagem={pedido.contasReceber.length} head={["Vencimento", "Valor", "Situação", "Ações"]}>
            {pedido.contasReceber.map((c) => (
              <tr key={c.id}>
                <Td>{date(c.vencimento)}</Td>
                <Td className="tnum text-right">{money(toNumber(c.valor))}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td>
                  {verFinanceiro ? (
                    <Link href={`/financeiro/receber/${c.id}`} className={btn.small}>
                      Ver no Financeiro
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-500">cobrança no Financeiro</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
