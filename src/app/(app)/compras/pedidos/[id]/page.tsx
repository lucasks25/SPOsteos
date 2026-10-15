import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, Field, Form, Grid } from "@/components/form";
import { Badge, btn, Card, Dl, KpiGrid, PageHeader, SectionTitle, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, inputDate, money, toNumber } from "@/lib/format";
import { documentoPedido, PERFIS_COMPRAS } from "../../_lib/perfis";
import { cancelarPedidoCompra, receberItem } from "../actions";

export default async function PedidoCompraPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(PERFIS_COMPRAS);
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();
  const pedido = await db.pedidoCompra.findUnique({
    where: { id },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: { include: { produto: { select: { codigo: true, descricao: true } } }, orderBy: { id: "asc" } },
      contasPagar: { orderBy: { criadoEm: "asc" }, select: { id: true, valor: true, vencimento: true, status: true } },
    },
  });
  if (!pedido) notFound();
  const doc = documentoPedido(pedido.id);
  const total = pedido.itens.reduce((s, i) => s + i.quantidade * toNumber(i.custoUnit), 0);
  const recebido = pedido.itens.reduce((s, i) => s + i.recebido * toNumber(i.custoUnit), 0);
  const podeReceber = pedido.status === "ABERTO" || pedido.status === "PARCIAL";
  const semRecebimento = pedido.itens.every((i) => i.recebido === 0);

  return (
    <>
      <PageHeader
        title={doc}
        subtitle={`Pedido de compra — ${pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}`}
        actions={
          <>
            <StatusBadge status={pedido.status} />
            {pedido.status === "ABERTO" && semRecebimento && (
              <ActionButton action={cancelarPedidoCompra.bind(null, pedido.id)} variant="danger" confirm="Cancelar este pedido?">
                Cancelar pedido
              </ActionButton>
            )}
          </>
        }
      />
      <KpiGrid>
        <Stat label="Valor do pedido" value={money(total)} />
        <Stat label="Recebido" value={money(recebido)} hint="gera conta a pagar a cada recebimento" />
        <Stat label="Previsão" value={date(pedido.previsao)} />
        <Stat label="Criado em" value={date(pedido.criadoEm)} />
      </KpiGrid>

      <div className="space-y-4">
        <Card title="Dados">
          <Dl
            items={[
              ["Fornecedor", pedido.fornecedor.razaoSocial],
              ["Tipo", pedido.importacao ? <Badge key="t" color="purple">importação</Badge> : "Nacional"],
              ["Invoice", pedido.invoice],
              ["DI", pedido.numeroDi],
              ["Observação", pedido.observacao],
            ]}
          />
        </Card>

        <div>
          <SectionTitle>Itens</SectionTitle>
          <Table head={["Produto", "Pedido", "Recebido", "Pendente", "Custo unit.", "Subtotal"]} empty={pedido.itens.length === 0} emptyText="Este pedido não tem itens.">
            {pedido.itens.map((i) => (
              <tr key={i.id}>
                <Td>
                  {i.produto.codigo} — {i.produto.descricao}
                </Td>
                <Td className="text-right">{i.quantidade}</Td>
                <Td className="text-right">{i.recebido}</Td>
                <Td className="text-right">{i.quantidade - i.recebido}</Td>
                <Td className="text-right">{money(toNumber(i.custoUnit))}</Td>
                <Td className="text-right">{money(i.quantidade * toNumber(i.custoUnit))}</Td>
              </tr>
            ))}
          </Table>
        </div>

        {podeReceber &&
          pedido.itens
            .filter((i) => i.quantidade > i.recebido)
            .map((i) => (
              <Card key={i.id} title={`Receber: ${i.produto.codigo} — ${i.produto.descricao} (pendente ${i.quantidade - i.recebido})`}>
                <Form action={receberItem.bind(null, pedido.id, i.id)} submitLabel="Registrar recebimento" resetOnSuccess>
                  <Grid cols={4}>
                    <Field label="Quantidade *" name="quantidade" type="number" min={1} max={i.quantidade - i.recebido} defaultValue={i.quantidade - i.recebido} required />
                    <Field label="Lote *" name="lote" required maxLength={60} />
                    <Field label="Validade *" name="validade" type="date" min={inputDate(new Date())} required />
                    <Field label="Fabricação" name="fabricacao" type="date" />
                    <Field label="Série" name="serie" maxLength={60} />
                  </Grid>
                </Form>
              </Card>
            ))}

        {pedido.contasPagar.length > 0 && (
          <div>
            <SectionTitle>Contas a pagar geradas</SectionTitle>
            <Table head={["Vencimento", "Valor", "Situação", ""]}>
              {pedido.contasPagar.map((c) => (
                <tr key={c.id}>
                  <Td>{date(c.vencimento)}</Td>
                  <Td className="text-right">{money(toNumber(c.valor))}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>
                    <Link href={`/financeiro/pagar/${c.id}`} className={btn.small}>
                      Abrir
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
