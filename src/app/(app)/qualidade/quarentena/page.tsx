import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LOCAIS } from "@/lib/estoque";
import { Badge, btn, PageHeader, SearchBar, StatusBadge, Table, Td } from "@/components/ui";
import { Totais } from "../../_componentes/totais";
import { date, diasAte, num } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_QUALIDADE } from "../_lib/perfis";
import { soStrings } from "@/lib/search-params";

export default async function QuarentenaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(PERFIS_QUALIDADE);
  const { q } = soStrings(await searchParams);
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
      <PageHeader title="Quarentena e inspeção" subtitle="Lotes recebidos aguardando inspeção." />
      <Totais
        itens={[
          { label: "Lotes aguardando", valor: num(lotes.length), tom: lotes.length ? "warn" : "default" },
          { label: "Unidades em quarentena", valor: num(lotes.reduce((s, l) => s + l.saldos.reduce((a, x) => a + x.quantidade, 0), 0)) },
          { label: "Com validade vencida", valor: num(lotes.filter((l) => l.validade < hoje).length), tom: lotes.some((l) => l.validade < hoje) ? "danger" : "default" },
        ]}
      />
      <SearchBar placeholder="Lote, código ou descrição do produto" defaultValue={q} />
      <Table titulo="Aguardando inspeção" contagem={lotes.length} head={["Produto", "Lote", { label: "Validade", hideOnMobile: true }, { label: "Registro ANVISA", hideOnMobile: true }, "Status", "Qtd. em quarentena", { label: "Recebido em", hideOnMobile: true }, ""]} empty={lotes.length === 0} emptyText={q ? "Nenhum lote em quarentena corresponde à busca." : "Nenhum lote aguardando inspeção."}>
        {lotes.map((l) => {
          const qtd = l.saldos.reduce((s, x) => s + x.quantidade, 0);
          const vencido = l.validade < hoje;
          const regVencido = l.produto.validadeRegistro ? l.produto.validadeRegistro < hoje : false;
          return (
            <tr key={l.id}>
              <Td className="max-w-[16rem] max-sm:max-w-[9rem]">
                <Link href={`/qualidade/quarentena/${l.id}`} className="link-linha block truncate font-medium text-teal-700 hover:underline">{l.produto.descricao}</Link>
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
