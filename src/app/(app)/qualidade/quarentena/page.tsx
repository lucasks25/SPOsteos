import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LOCAIS } from "@/lib/estoque";
import { Badge, btn, KpiGrid, PageHeader, SearchBar, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { date, diasAte, num } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_QUALIDADE } from "../_lib/perfis";

export default async function QuarentenaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(PERFIS_QUALIDADE);
  const { q } = await searchParams;
  const hoje = hojeUTC();
  const lotes = await db.lote.findMany({
    where: {
      OR: [{ status: "QUARENTENA" }, { saldos: { some: { localId: LOCAIS.QUARENTENA, quantidade: { gt: 0 } } } }],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { numero: { contains: q, mode: "insensitive" } },
                  { produto: { descricao: { contains: q, mode: "insensitive" } } },
                  { produto: { codigo: { contains: q, mode: "insensitive" } } },
                ],
              },
            ],
          }
        : {}),
    },
    include: {
      produto: { select: { codigo: true, descricao: true, registroAnvisa: true, validadeRegistro: true } },
      saldos: { where: { localId: LOCAIS.QUARENTENA }, select: { quantidade: true } },
    },
    orderBy: { criadoEm: "asc" },
    take: 300,
  });

  return (
    <>
      <PageHeader title="Quarentena e inspeção" subtitle="Para a Qualidade: lotes recebidos que aguardam inspeção antes de serem liberados para uso." />
      <KpiGrid cols={3}>
        <Stat label="Lotes aguardando" value={num(lotes.length)} tone={lotes.length ? "warn" : "default"} />
        <Stat label="Unidades em quarentena" value={num(lotes.reduce((s, l) => s + l.saldos.reduce((a, x) => a + x.quantidade, 0), 0))} />
        <Stat label="Com validade vencida" value={num(lotes.filter((l) => l.validade < hoje).length)} tone={lotes.some((l) => l.validade < hoje) ? "danger" : "default"} />
      </KpiGrid>
      <SearchBar placeholder="Lote, código ou descrição do produto" defaultValue={q} />
      <Table titulo="Aguardando inspeção" icone="frasco" contagem={lotes.length} head={["Produto", "Lote", "Validade", "Registro ANVISA", "Status", "Qtd. em quarentena", "Recebido em", ""]} empty={lotes.length === 0} emptyText={q ? "Nenhum lote em quarentena corresponde à busca." : "Nenhum lote aguardando inspeção."}>
        {lotes.map((l) => {
          const qtd = l.saldos.reduce((s, x) => s + x.quantidade, 0);
          const vencido = l.validade < hoje;
          const regVencido = l.produto.validadeRegistro ? l.produto.validadeRegistro < hoje : false;
          return (
            <tr key={l.id}>
              <Td>
                <Link href={`/qualidade/quarentena/${l.id}`} className="font-medium text-teal-700 hover:underline">{l.produto.descricao}</Link>
                <div className="text-xs text-slate-500"><span className="font-mono">{l.produto.codigo}</span></div>
              </Td>
              <Td className="font-mono text-xs">
                {l.numero}
                {l.serie && <span className="text-slate-500"> / {l.serie}</span>}
              </Td>
              <Td>
                {date(l.validade)} {vencido ? <Badge color="red">vencido</Badge> : diasAte(l.validade) <= 90 && <Badge color="yellow">{diasAte(l.validade)}d</Badge>}
              </Td>
              <Td>
                {l.produto.registroAnvisa ?? <Badge color="yellow">sem registro</Badge>} {regVencido && <Badge color="red">reg. vencido</Badge>}
              </Td>
              <Td>
                <StatusBadge status={l.status} />
              </Td>
              <Td className="text-right">{num(qtd)}</Td>
              <Td>{date(l.criadoEm)}</Td>
              <Td>
                <Link href={`/qualidade/quarentena/${l.id}`} className={btn.small}>
                  Inspecionar
                </Link>
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
