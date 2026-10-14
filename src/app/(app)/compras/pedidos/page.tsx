import Link from "next/link";
import { Badge, LinkButton, PageHeader, StatusBadge, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";

const STATUS = ["ABERTO", "PARCIAL", "RECEBIDO", "CANCELADO"] as const;
type Status = (typeof STATUS)[number];
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

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
  return (
    <>
      <PageHeader title="Pedidos de compra" subtitle="Compras nacionais e importações" actions={<LinkButton href="/compras/pedidos/novo">Novo pedido</LinkButton>} />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Busca</span>
          <input name="q" defaultValue={q} placeholder="PC-12, fornecedor ou invoice" className={`${inputCls} w-64`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
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
      </form>
      <Table head={["Pedido", "Fornecedor", "Criado", "Previsão", "Itens recebidos", "Valor", "Status"]} empty={pedidos.length === 0}>
        {pedidos.map((p) => {
          const qtd = p.itens.reduce((a, i) => a + i.quantidade, 0);
          const rec = p.itens.reduce((a, i) => a + i.recebido, 0);
          const valor = p.itens.reduce((a, i) => a + i.quantidade * toNumber(i.custoUnit), 0);
          return (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/compras/pedidos/${p.id}`} className="text-teal-700 hover:underline">
                  {documentoPedido(p.id)}
                </Link>{" "}
                {p.importacao && <Badge color="purple">importação</Badge>}
              </Td>
              <Td className="max-w-[16rem] truncate">{p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}</Td>
              <Td>{date(p.criadoEm)}</Td>
              <Td>{date(p.previsao)}</Td>
              <Td>
                {rec} / {qtd}
              </Td>
              <Td className="text-right tabular-nums">{money(valor)}</Td>
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
