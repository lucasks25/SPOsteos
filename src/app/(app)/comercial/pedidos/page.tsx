import Link from "next/link";
import { KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "../_components/filtros";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";

const STATUS = ["ABERTO", "FATURADO", "CANCELADO"] as const;

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
      <KpiGrid cols={3}>
        <Stat label="Abertos (sem NF) na lista" value={money(aFaturar)} hint={`${pedidos.filter((p) => p.status === "ABERTO").length} pedido(s)`} tone={aFaturar > 0 ? "warn" : "default"} />
      </KpiGrid>
      <Filtros limparHref="/comercial/pedidos">
        <FiltroInput label="Busca" name="q" defaultValue={q} placeholder="PV-12, NF ou hospital" className="w-64" />
        <FiltroSelect label="Status" name="status" defaultValue={s ?? ""} options={STATUS.map((x) => ({ value: x, label: x.toLowerCase() }))} />
      </Filtros>
      <Table head={["Pedido", "Hospital", "Cirurgia", "Criado", "NF", "Total", "Status"]} empty={pedidos.length === 0} emptyText="Nenhum pedido de venda encontrado. Pedidos são gerados ao faturar uma cirurgia realizada." emptyAction={<LinkButton href="/comercial/cirurgias?status=REALIZADA" variant="secondary">Ver cirurgias realizadas</LinkButton>}>
        {pedidos.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/comercial/pedidos/${p.id}`} className="font-mono text-xs text-teal-700 hover:underline">
                PV-{p.id}
              </Link>
            </Td>
            <Td className="max-w-[16rem] truncate">{p.hospital.nomeFantasia || p.hospital.razaoSocial}</Td>
            <Td>{p.cirurgia ? `CIR-${p.cirurgia.numero}` : "—"}</Td>
            <Td>{date(p.criadoEm)}</Td>
            <Td>{p.numeroNf ?? "—"}</Td>
            <Td className="text-right">{money(toNumber(p.total))}</Td>
            <Td>
              <StatusBadge status={p.status} />
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
