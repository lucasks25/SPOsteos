import Link from "next/link";
import { KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
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
  const abertos = pedidos.filter((p) => p.status === "ABERTO");
  const faturados = pedidos.filter((p) => p.status === "FATURADO");
  const soma = (l: typeof pedidos) => l.reduce((a, p) => a + toNumber(p.total), 0);
  const aFaturar = soma(abertos);
  return (
    <>
      <PageHeader title="Pedidos de venda" subtitle="Gerados ao faturar uma cirurgia realizada. O Comercial registra a nota fiscal; a cobrança fica no Financeiro." />
      <KpiGrid>
        <Stat label="Na lista" value={money(soma(pedidos))} hint={`${pedidos.length} pedido(s)`} />
        <Stat label="Abertos (sem NF)" value={money(aFaturar)} hint={<span className={aFaturar > 0 ? "text-amber-700" : undefined}>{abertos.length} pedido(s) a faturar</span>} tone={aFaturar > 0 ? "warn" : "default"} />
        <Stat label="Faturados" value={money(soma(faturados))} hint={<span className="text-emerald-700">{faturados.length} pedido(s)</span>} />
      </KpiGrid>
      <Filtros limparHref="/comercial/pedidos">
        <FiltroInput label="Busca" name="q" defaultValue={q} placeholder="PV-12, NF ou hospital" className="w-64" />
        <FiltroSelect label="Status" name="status" defaultValue={s ?? ""} options={STATUS.map((x) => ({ value: x, label: x.toLowerCase() }))} />
      </Filtros>
      <Table
        titulo="Pedidos de venda"
        icone="carrinho"
        contagem={pedidos.length}
        head={["Pedido", "Hospital", "Nota fiscal", "Total", "Situação", "Ações"]}
        empty={pedidos.length === 0}
        emptyText="Nenhum pedido de venda encontrado. Pedidos são gerados ao faturar uma cirurgia realizada."
        emptyAction={<LinkButton href="/comercial/cirurgias?status=REALIZADA" variant="secondary">Ver cirurgias realizadas</LinkButton>}
      >
        {pedidos.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/comercial/pedidos/${p.id}`} className="font-mono text-xs font-semibold text-teal-700 hover:underline">
                PV-{p.id}
              </Link>
              <div className="text-[11px] text-slate-500">{date(p.criadoEm)}</div>
            </Td>
            <Td className="max-w-[18rem]">
              <div className="truncate font-medium text-teal-700">{p.hospital.nomeFantasia || p.hospital.razaoSocial}</div>
              <div className="text-xs text-slate-500">{p.cirurgia ? `Cirurgia CIR-${p.cirurgia.numero}` : "Sem cirurgia vinculada"}</div>
            </Td>
            <Td>{p.numeroNf ? `NF ${p.numeroNf}` : <span className="text-slate-500">sem NF</span>}</Td>
            <Td className="tnum text-right font-semibold">{money(toNumber(p.total))}</Td>
            <Td>
              <StatusBadge status={p.status} />
            </Td>
            <Td>
              <LinkButton href={`/comercial/pedidos/${p.id}`} variant="small">Abrir</LinkButton>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
