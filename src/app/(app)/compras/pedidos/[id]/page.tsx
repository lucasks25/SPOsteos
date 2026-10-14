import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, Field, Form, Grid } from "@/components/form";
import { Badge, Card, Dl, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
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
        subtitle={pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}
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
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Valor do pedido" value={money(total)} />
        <Stat label="Recebido" value={money(recebido)} hint="gera conta a pagar a cada recebimento" />
        <Stat label="Previsão" value={date(pedido.previsao)} />
        <Stat label="Criado em" value={date(pedido.criadoEm)} />
      </div>

      <div className="space-y-6">
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

        <Card title="Itens">
          <Table head={["Produto", "Pedido", "Recebido", "Pendente", "Custo unit.", "Subtotal"]}>
            {pedido.itens.map((i) => (
              <tr key={i.id}>
                <Td>
                  {i.produto.codigo} — {i.produto.descricao}
                </Td>
                <Td>{i.quantidade}</Td>
                <Td>{i.recebido}</Td>
                <Td>{i.quantidade - i.recebido}</Td>
                <Td className="tabular-nums">{money(toNumber(i.custoUnit))}</Td>
                <Td className="tabular-nums">{money(i.quantidade * toNumber(i.custoUnit))}</Td>
              </tr>
            ))}
          </Table>
        </Card>

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
          <Card title="Contas a pagar geradas">
            <Table head={["Vencimento", "Valor", "Situação", ""]}>
              {pedido.contasPagar.map((c) => (
                <tr key={c.id}>
                  <Td>{date(c.vencimento)}</Td>
                  <Td className="tabular-nums">{money(toNumber(c.valor))}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>
                    <Link href={`/financeiro/pagar/${c.id}`} className="text-teal-700 hover:underline">
                      abrir
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
