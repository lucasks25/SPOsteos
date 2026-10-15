import Link from "next/link";
import { PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";

const STATUS = ["ABERTO", "FATURADO", "CANCELADO"] as const;
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

export default async function PedidosVendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const s = typeof sp.status === "string" && (STATUS as readonly string[]).includes(sp.status) ? (sp.status as (typeof STATUS)[number]) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const n = q.replace(/^pv-?/i, "");
  const pedidos = await db.pedidoVenda.findMany({
    where: {
      ...(s ? { status: s } : {}),
      ...(q ? { OR: [...(/^\d+$/.test(n) ? [{ id: Number(n) }] : []), { numeroNf: { contains: q, mode: "insensitive" as const } }, { hospital: { razaoSocial: { contains: q, mode: "insensitive" as const } } }, { hospital: { nomeFantasia: { contains: q, mode: "insensitive" as const } } }] } : {}),
    },
    orderBy: { id: "desc" },
    take: 200,
    include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } }, cirurgia: { select: { numero: true } } },
  });
  const aFaturar = pedidos.filter((p) => p.status === "ABERTO").reduce((a, p) => a + toNumber(p.total), 0);
  return (
    <>
      <PageHeader title="Pedidos de venda" subtitle="Gerados ao faturar uma cirurgia realizada" />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Abertos (sem NF) na lista" value={money(aFaturar)} hint={`${pedidos.filter((p) => p.status === "ABERTO").length} pedido(s)`} tone={aFaturar > 0 ? "warn" : "default"} />
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Busca</span>
          <input name="q" defaultValue={q} placeholder="PV-12, NF ou hospital" className={`${inputCls} w-64`} />
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
        <Link href="/comercial/pedidos" className={btn.ghost}>
          Limpar
        </Link>
      </form>
      <Table head={["Pedido", "Hospital", "Cirurgia", "Criado", "NF", "Total", "Status"]} empty={pedidos.length === 0}>
        {pedidos.map((p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/comercial/pedidos/${p.id}`} className="text-teal-700 hover:underline">
                PV-{p.id}
              </Link>
            </Td>
            <Td className="max-w-[16rem] truncate">{p.hospital.nomeFantasia || p.hospital.razaoSocial}</Td>
            <Td>{p.cirurgia ? `CIR-${p.cirurgia.numero}` : "—"}</Td>
            <Td>{date(p.criadoEm)}</Td>
            <Td>{p.numeroNf ?? "—"}</Td>
            <Td className="text-right tabular-nums">{money(toNumber(p.total))}</Td>
            <Td>
              <StatusBadge status={p.status} />
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
