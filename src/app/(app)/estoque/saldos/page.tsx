import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, KpiGrid, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "../../comercial/_components/filtros";
import { date, diasAte, money, num, toNumber } from "@/lib/format";
import { PERFIS_VER } from "../_lib/perfis";

type SP = { local?: string; q?: string; status?: string };

export default async function SaldosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(PERFIS_VER);
  const sp = await searchParams;
  const [locais, saldos] = await Promise.all([
    db.localEstoque.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
    db.saldo.findMany({
      where: {
        quantidade: { gt: 0 },
        ...(sp.local ? { localId: sp.local } : {}),
        ...(sp.status ? { lote: { status: sp.status as never } } : {}),
        ...(sp.q
          ? { produto: { OR: [{ descricao: { contains: sp.q, mode: "insensitive" } }, { codigo: { contains: sp.q, mode: "insensitive" } }] } }
          : {}),
      },
      include: { produto: true, lote: true, local: true },
      orderBy: [{ produto: { descricao: "asc" } }, { lote: { validade: "asc" } }],
      take: 2000,
    }),
  ]);

  // Agrupa por produto
  const grupos = new Map<string, { produto: (typeof saldos)[number]["produto"]; linhas: typeof saldos; qtd: number }>();
  for (const s of saldos) {
    const g = grupos.get(s.produtoId) ?? { produto: s.produto, linhas: [], qtd: 0 };
    g.linhas.push(s);
    g.qtd += s.quantidade;
    grupos.set(s.produtoId, g);
  }
  const valorTotal = saldos.reduce((v, s) => v + s.quantidade * toNumber(s.produto.custoMedio), 0);
  const vencidos = saldos.filter((s) => diasAte(s.lote.validade) < 0).reduce((n, s) => n + s.quantidade, 0);
  const vencendo = saldos.filter((s) => { const d = diasAte(s.lote.validade); return d >= 0 && d <= 30; }).reduce((n, s) => n + s.quantidade, 0);
  const porLocal = new Map<string, { nome: string; qtd: number; valor: number }>();
  for (const s of saldos) {
    const l = porLocal.get(s.localId) ?? { nome: s.local.nome, qtd: 0, valor: 0 };
    l.qtd += s.quantidade;
    l.valor += s.quantidade * toNumber(s.produto.custoMedio);
    porLocal.set(s.localId, l);
  }

  return (
    <>
      <PageHeader title="Saldos por local" subtitle="Estoque próprio, em quarentena e consignado nos hospitais, por produto e lote." />
      <KpiGrid>
        <Stat label="Unidades" value={num(saldos.reduce((n, s) => n + s.quantidade, 0))} hint={`${grupos.size} produto(s)`} />
        <Stat label="Valor a custo médio" value={money(valorTotal)} />
        <Stat label="Vencendo em 30 dias" value={num(vencendo)} tone={vencendo ? "warn" : "default"} />
        <Stat label="Vencidos com saldo" value={num(vencidos)} tone={vencidos ? "danger" : "default"} />
      </KpiGrid>

      <Filtros limparHref="/estoque/saldos">
        <FiltroInput label="Produto" name="q" defaultValue={sp.q} placeholder="Descrição ou código" className="w-56" />
        <FiltroSelect label="Local" name="local" defaultValue={sp.local} todos="Todos os locais" options={locais.map((l) => ({ value: l.id, label: l.nome }))} />
        <FiltroSelect
          label="Status do lote"
          name="status"
          defaultValue={sp.status}
          todos="Qualquer status"
          options={["LIBERADO", "QUARENTENA", "NAO_CONFORME", "BLOQUEADO", "VENCIDO"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))}
        />
      </Filtros>

      {!sp.local && porLocal.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {[...porLocal.entries()].map(([id, l]) => (
            <Link key={id} href={`/estoque/saldos?local=${id}`} className="rounded border border-slate-200 bg-white px-3 py-1.5 hover:border-teal-700">
              <span className="font-medium text-slate-700">{l.nome}</span>
              <span className="tnum ml-2 text-slate-600">{num(l.qtd)} un · {money(l.valor)}</span>
            </Link>
          ))}
        </div>
      )}

      <Table head={["Produto", "Lote", "Validade", "Status", "Local", "Qtd.", "Valor"]} empty={saldos.length === 0} emptyText="Nenhum saldo encontrado para os filtros informados.">
        {[...grupos.values()].map((g) =>
          g.linhas.map((s, idx) => {
            const dias = diasAte(s.lote.validade);
            return (
              <tr key={s.id} className={idx === 0 ? "border-t-2 border-slate-200" : undefined}>
                <Td className="whitespace-normal">
                  {idx === 0 && (
                    <>
                      <div className="font-medium">{g.produto.descricao}</div>
                      <div className="text-xs text-slate-600">
                        {g.produto.codigo} · total {num(g.qtd)}
                        {g.qtd < g.produto.estoqueMinimo && <span className="ml-1 text-rose-600">(abaixo do mínimo {g.produto.estoqueMinimo})</span>}
                      </div>
                    </>
                  )}
                </Td>
                <Td className="font-mono text-xs">
                  <Link href={`/qualidade/lotes/${s.loteId}`} className="text-teal-700 hover:underline">{s.lote.numero}</Link>
                </Td>
                <Td>
                  {date(s.lote.validade)} {dias < 0 ? <Badge color="red">vencido</Badge> : dias <= 30 ? <Badge color="yellow">{dias}d</Badge> : null}
                </Td>
                <Td><StatusBadge status={s.lote.status} /></Td>
                <Td>{s.local.nome}</Td>
                <Td className="text-right font-semibold">{num(s.quantidade)}</Td>
                <Td className="text-right">{money(s.quantidade * toNumber(g.produto.custoMedio))}</Td>
              </tr>
            );
          }),
        )}
      </Table>
    </>
  );
}
