import Link from "next/link";
import { Badge, FilterBar, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, num as fmtNum, toNumber } from "@/lib/format";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";

const STATUS = ["ABERTO", "PARCIAL", "RECEBIDO", "CANCELADO"] as const;
type Status = (typeof STATUS)[number];
const inputCls = "h-10 rounded-lg border border-field bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20";

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
      <PageHeader title="Pedidos de compra" subtitle="Para Compras: acompanhe compras nacionais e importações, do pedido ao recebimento." actions={<LinkButton href="/compras/pedidos/novo">Novo pedido</LinkButton>} />
      <KpiGrid cols={4}>
        <Stat label="Pedidos listados" value={fmtNum(pedidos.length)} icon="carrinho" />
        <Stat label="Em aberto" value={fmtNum(emAberto.length)} tone={emAberto.length ? "warn" : "default"} hint="abertos ou parciais" icon="atividade" />
        <Stat label="Valor em aberto" value={money(emAberto.reduce((a, p) => a + valorPedido(p), 0))} icon="pagar" />
        <Stat label="Importações" value={fmtNum(pedidos.filter((p) => p.importacao).length)} icon="caminhao" />
      </KpiGrid>
      <FilterBar>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-700">Busca</span>
          <input name="q" defaultValue={q} placeholder="PC-12, fornecedor ou invoice" className={`${inputCls} w-64`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-700">Status</span>
          <select name="status" defaultValue={s ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {STATUS.map((x) => (
              <option key={x} value={x}>
                {x.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button className={btn.secondary}>Filtrar</button>
        <Link href="/compras/pedidos" className={btn.ghost}>
          Limpar
        </Link>
      </FilterBar>
      <Table titulo="Pedidos" icone="carrinho" contagem={pedidos.length} head={["Pedido", "Fornecedor", "Criado", "Previsão", "Recebido / pedido", "Valor", "Status", ""]} empty={pedidos.length === 0} emptyText={q || s ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido de compra registrado."} emptyAction={!q && !s ? <LinkButton href="/compras/pedidos/novo" variant="secondary" icon="mais">Criar o primeiro pedido</LinkButton> : undefined}>
        {pedidos.map((p) => {
          const qtd = p.itens.reduce((a, i) => a + i.quantidade, 0);
          const rec = p.itens.reduce((a, i) => a + i.recebido, 0);
          const valor = p.itens.reduce((a, i) => a + i.quantidade * toNumber(i.custoUnit), 0);
          return (
            <tr key={p.id}>
              <Td>
                <Link href={`/compras/pedidos/${p.id}`} className="font-semibold text-teal-700 hover:underline">
                  {documentoPedido(p.id)}
                </Link>{" "}
                {p.importacao && <Badge color="purple">importação</Badge>}
              </Td>
              <Td className="max-w-[16rem] truncate">
                <div>{p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}</div>
                {p.fornecedor.nomeFantasia && <div className="text-xs text-slate-500">{p.fornecedor.razaoSocial}</div>}
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
              <Td>
                <Link href={`/compras/pedidos/${p.id}`} className={btn.small}>Abrir</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
