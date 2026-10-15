import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, StatusBadge, Table, Td } from "@/components/ui";
import { date, dateTime, diasAte, num } from "@/lib/format";

type SaldoRow = Awaited<ReturnType<typeof carregarConsignado>>[number];

export async function carregarConsignado(hospitalId: string) {
  return db.saldo.findMany({
    where: { local: { hospitalId }, quantidade: { gt: 0 } },
    include: {
      produto: { select: { id: true, codigo: true, descricao: true } },
      lote: { select: { numero: true, validade: true, status: true } },
    },
    orderBy: [{ produto: { descricao: "asc" } }, { lote: { validade: "asc" } }],
  });
}

/** Estoque consignado no hospital, agrupado por produto (com lotes/validades). */
export function EstoqueConsignado({ saldos }: { saldos: SaldoRow[] }) {
  const grupos = new Map<string, { codigo: string; descricao: string; total: number; lotes: SaldoRow[] }>();
  for (const s of saldos) {
    const g = grupos.get(s.produtoId) ?? { codigo: s.produto.codigo, descricao: s.produto.descricao, total: 0, lotes: [] };
    g.total += s.quantidade;
    g.lotes.push(s);
    grupos.set(s.produtoId, g);
  }
  const lista = [...grupos.values()];
  return (
    <Table head={["Código", "Produto", "Qtd. total", "Lotes (validade · qtd.)"]} empty={lista.length === 0} emptyText="Nenhum item consignado neste hospital.">
      {lista.map((g) => (
        <tr key={g.codigo} className="align-top">
          <Td className="font-mono text-xs">{g.codigo}</Td>
          <Td className="whitespace-normal">{g.descricao}</Td>
          <Td className="text-right font-semibold">{num(g.total)}</Td>
          <Td>
            <ul className="space-y-0.5">
              {g.lotes.map((l) => {
                const dias = diasAte(l.lote.validade);
                return (
                  <li key={l.id} className="text-xs">
                    <span className="font-mono">{l.lote.numero}</span> · {date(l.lote.validade)} · {num(l.quantidade)}{" "}
                    {dias < 0 ? <Badge color="red">vencido</Badge> : dias <= 90 ? <Badge color="yellow">{dias}d</Badge> : null}
                    {l.lote.status !== "LIBERADO" && <StatusBadge status={l.lote.status} />}
                  </li>
                );
              })}
            </ul>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export async function UltimasCirurgias({ hospitalId }: { hospitalId: string }) {
  const cirurgias = await db.cirurgia.findMany({
    where: { hospitalId },
    include: { medico: { select: { nome: true } }, procedimento: { select: { descricao: true } } },
    orderBy: { dataHora: "desc" },
    take: 10,
  });
  return (
    <Card title="Últimas cirurgias">
      {cirurgias.length === 0 ? (
        <EmptyState text="Nenhuma cirurgia registrada para este hospital." icon="calendario" />
      ) : (
        <ul className="divide-y divide-slate-200 text-[13px]">
          {cirurgias.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link href={`/comercial/cirurgias/${c.id}`} className="font-medium text-teal-700 hover:underline">
                  #{c.numero} · {c.paciente}
                </Link>
                <div className="truncate text-xs text-slate-600">
                  {dateTime(c.dataHora)} · {c.medico.nome}
                  {c.procedimento && ` · ${c.procedimento.descricao}`}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
