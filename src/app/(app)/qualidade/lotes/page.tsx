import Link from "next/link";
import type { Prisma, StatusLote } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionButton } from "@/components/form";
import { Badge, btn, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { date, diasAte, num } from "@/lib/format";
import { hojeUTC, PERFIS_QUALIDADE, somarDias } from "../_lib/datas";
import { marcarVencidos } from "./actions";
import { FiltroInput, FiltroSelect, Filtros } from "../../comercial/_components/filtros";

const STATUS: StatusLote[] = ["QUARENTENA", "LIBERADO", "NAO_CONFORME", "BLOQUEADO", "VENCIDO"];

type SP = { q?: string; status?: string; dias?: string; vencidos?: string; comSaldo?: string };

export default async function LotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(PERFIS_QUALIDADE);
  const sp = await searchParams;
  const hoje = hojeUTC();
  const status = STATUS.includes(sp.status as StatusLote) ? (sp.status as StatusLote) : undefined;
  const dias = sp.dias && /^\d+$/.test(sp.dias) ? Number(sp.dias) : undefined;

  const and: Prisma.LoteWhereInput[] = [];
  if (sp.q) {
    and.push({
      OR: [
        { numero: { contains: sp.q, mode: "insensitive" } },
        { serie: { contains: sp.q, mode: "insensitive" } },
        { produto: { descricao: { contains: sp.q, mode: "insensitive" } } },
        { produto: { codigo: { contains: sp.q, mode: "insensitive" } } },
        { produto: { gtin: sp.q } },
      ],
    });
  }
  if (status) and.push({ status });
  if (sp.vencidos) and.push({ validade: { lt: hoje } });
  else if (dias !== undefined) and.push({ validade: { gte: hoje, lte: somarDias(hoje, dias) } });
  if (sp.comSaldo) and.push({ saldos: { some: { quantidade: { gt: 0 } } } });

  const [lotes, vencidosLiberados] = await Promise.all([
    db.lote.findMany({
      where: { AND: and },
      include: {
        produto: { select: { codigo: true, descricao: true } },
        saldos: { where: { quantidade: { not: 0 } }, include: { local: { select: { nome: true } } } },
      },
      orderBy: { validade: "asc" },
      take: 300,
    }),
    db.lote.count({ where: { status: "LIBERADO", validade: { lt: hoje } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Lotes e validades"
        subtitle="Acompanhe lotes, status de qualidade e vencimentos."
        actions={
          vencidosLiberados > 0 ? (
            <ActionButton action={marcarVencidos} variant="danger" confirm={`Marcar ${vencidosLiberados} lote(s) liberado(s) vencido(s) como VENCIDO?`}>
              Marcar {vencidosLiberados} vencido(s)
            </ActionButton>
          ) : undefined
        }
      />
      <Filtros limparHref="/qualidade/lotes">
        <FiltroInput label="Busca" name="q" defaultValue={sp.q} placeholder="Lote, série, produto ou GTIN" className="w-64" />
        <FiltroSelect label="Status" name="status" defaultValue={status ?? ""} todos="Todos os status" options={STATUS.map((s) => ({ value: s, label: s.replaceAll("_", " ").toLowerCase() }))} />
        <FiltroInput label="Vence em até (dias)" name="dias" type="number" defaultValue={sp.dias} className="w-28" />
        <label className="flex h-8 items-center gap-1.5 text-[13px] text-slate-700">
          <input type="checkbox" name="vencidos" value="1" defaultChecked={!!sp.vencidos} /> Vencidos
        </label>
        <label className="flex h-8 items-center gap-1.5 text-[13px] text-slate-700">
          <input type="checkbox" name="comSaldo" value="1" defaultChecked={!!sp.comSaldo} /> Somente com saldo
        </label>
      </Filtros>
      <Table head={["Produto", "Lote / série", "Validade", "Status", "Saldo total", "Saldo por local", ""]} empty={lotes.length === 0} emptyText="Nenhum lote encontrado com esses filtros.">
        {lotes.map((l) => {
          const total = l.saldos.reduce((s, x) => s + x.quantidade, 0);
          const d = diasAte(l.validade);
          return (
            <tr key={l.id} className="align-top">
              <Td>
                <span className="font-mono text-xs text-slate-500">{l.produto.codigo}</span> {l.produto.descricao}
              </Td>
              <Td className="font-mono text-xs">
                {l.numero}
                {l.serie && <span className="text-slate-500"> / {l.serie}</span>}
              </Td>
              <Td>
                {date(l.validade)}{" "}
                {l.validade < hoje ? <Badge color="red">vencido</Badge> : d <= 90 ? <Badge color="yellow">{d}d</Badge> : null}
              </Td>
              <Td><StatusBadge status={l.status} /></Td>
              <Td className="text-right font-medium tnum">{num(total)}</Td>
              <Td className="text-xs">
                {l.saldos.length === 0
                  ? "—"
                  : l.saldos.map((s) => (
                      <div key={s.id}>
                        {s.local.nome}: <span className="font-medium">{num(s.quantidade)}</span>
                      </div>
                    ))}
              </Td>
              <Td>
                <Link href={`/qualidade/lotes/${l.id}`} className={btn.small}>Detalhes</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
      {lotes.length === 300 && <p className="mt-2 text-xs text-slate-600">Exibindo os primeiros 300 lotes. Refine os filtros.</p>}
    </>
  );
}
