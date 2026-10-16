import { Badge, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { Celula } from "@/components/lista";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
import { requireUser } from "@/lib/auth";
import { Totais } from "../../_componentes/totais";
import { db } from "@/lib/db";
import { date, money, num as fmtNum, toNumber } from "@/lib/format";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";

const STATUS = ["ABERTO", "PARCIAL", "RECEBIDO", "CANCELADO"] as const;
type Status = (typeof STATUS)[number];

export default async function PedidosCompraPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(PERFIS_COMPRAS);
  const sp = await searchParams;
  const s = typeof sp.status === "string" && (STATUS as readonly string[]).includes(sp.status) ? (sp.status as Status) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const num = /^\d+$/.test(q.replace(/^pc-?/i, "")) ? Number(q.replace(/^pc-?/i, "")) : null;
  const pedidos = await db.pedidoCompra.findMany({
    where: {
      ...(s ? { status: s } : {}),
      ...(q ? { OR: [...(num ? [{ id: num }] : []), { fornecedor: { razaoSocial: { contains: q, mode: "insensitive" as const } } }, { invoice: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { id: "desc" },
    take: 200,
    include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, itens: { select: { quantidade: true, recebido: true, custoUnit: true } } },
  });
  const valorPedido = (p: (typeof pedidos)[number]) => p.itens.reduce((a, i) => a + i.quantidade * toNumber(i.custoUnit), 0);
  const emAberto = pedidos.filter((p) => p.status === "ABERTO" || p.status === "PARCIAL");
  return (
    <>
      <PageHeader title="Pedidos de compra" subtitle="Acompanhe compras nacionais e importações, do pedido ao recebimento." actions={<LinkButton href="/compras/pedidos/novo">Novo pedido</LinkButton>} />
      <Totais
        itens={[
          { label: "Pedidos listados", valor: fmtNum(pedidos.length) },
          { label: "Em aberto", valor: fmtNum(emAberto.length), tom: emAberto.length ? "warn" : "default" },
          { label: "Valor em aberto", valor: money(emAberto.reduce((a, p) => a + valorPedido(p), 0)) },
          { label: "Importações", valor: fmtNum(pedidos.filter((p) => p.importacao).length) },
        ]}
      />
      <Filtros limparHref="/compras/pedidos">
        <FiltroInput label="Busca" name="q" defaultValue={q} placeholder="PC-12, fornecedor ou invoice" className="w-full sm:w-64" />
        <FiltroSelect label="Status" name="status" defaultValue={s} options={STATUS.map((x) => ({ value: x, label: x.toLowerCase() }))} />
      </Filtros>
      <Table titulo="Pedidos" contagem={pedidos.length} head={["Pedido", "Fornecedor", { label: "Criado", hideOnMobile: true }, { label: "Previsão", hideOnMobile: true }, { label: "Recebido / pedido", hideOnMobile: true }, "Valor", "Status"]} empty={pedidos.length === 0} emptyText={q || s ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido de compra registrado."} emptyAction={!q && !s ? <LinkButton href="/compras/pedidos/novo" variant="secondary" icon="mais">Criar o primeiro pedido</LinkButton> : undefined}>
        {pedidos.map((p) => {
          const qtd = p.itens.reduce((a, i) => a + i.quantidade, 0);
          const rec = p.itens.reduce((a, i) => a + i.recebido, 0);
          const valor = p.itens.reduce((a, i) => a + i.quantidade * toNumber(i.custoUnit), 0);
          return (
            <tr key={p.id}>
              <Td>
                <span className="inline-flex items-center gap-1.5">
                  <Celula href={`/compras/pedidos/${p.id}`} principal={<span className="font-semibold">{documentoPedido(p.id)}</span>} />
                  {p.importacao && <Badge color="purple">importação</Badge>}
                </span>
              </Td>
              <Td className="max-w-[16rem] max-sm:max-w-[9rem]">
                <div className="truncate">{p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}</div>
                {p.fornecedor.nomeFantasia && <div className="truncate text-xs text-slate-500" title={p.fornecedor.razaoSocial}>{p.fornecedor.razaoSocial}</div>}
              </Td>
              <Td>{date(p.criadoEm)}</Td>
              <Td>{date(p.previsao)}</Td>
              <Td className="text-right tnum">
                {rec} / {qtd}
              </Td>
              <Td className="text-right">{money(valor)}</Td>
              <Td>
                <StatusBadge status={p.status} />
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
