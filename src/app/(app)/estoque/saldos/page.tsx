import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
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
  const sel = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <>
      <PageHeader title="Saldos por local" subtitle="Estoque próprio, quarentena e consignado nos hospitais" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Unidades" value={num(saldos.reduce((n, s) => n + s.quantidade, 0))} hint={`${grupos.size} produto(s)`} />
        <Stat label="Valor a custo médio" value={money(valorTotal)} />
        <Stat label="Vencendo em 30 dias" value={num(vencendo)} tone={vencendo ? "warn" : "default"} />
        <Stat label="Vencidos com saldo" value={num(vencidos)} tone={vencidos ? "danger" : "default"} />
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Produto ou código" className={`${sel} w-full max-w-xs`} />
        <select name="local" defaultValue={sp.local ?? ""} className={sel}>
          <option value="">Todos os locais</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={sel}>
          <option value="">Qualquer status do lote</option>
          {["LIBERADO", "QUARENTENA", "NAO_CONFORME", "BLOQUEADO", "VENCIDO"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>
          ))}
        </select>
        <button className={btn.secondary}>Filtrar</button>
      </form>

      {!sp.local && porLocal.size > 0 && (
        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          {[...porLocal.entries()].map(([id, l]) => (
            <Link key={id} href={`/estoque/saldos?local=${id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-teal-600">
              <span className="font-medium text-slate-700">{l.nome}</span>
              <span className="ml-2 text-slate-500">{num(l.qtd)} un · {money(l.valor)}</span>
            </Link>
          ))}
        </div>
      )}

      <Table head={["Produto", "Lote", "Validade", "Status", "Local", "Qtd.", "Valor"]} empty={saldos.length === 0}>
        {[...grupos.values()].map((g) =>
          g.linhas.map((s, idx) => {
            const dias = diasAte(s.lote.validade);
            return (
              <tr key={s.id} className={idx === 0 ? "border-t-2 border-slate-200" : undefined}>
                <Td className="whitespace-normal">
                  {idx === 0 && (
                    <>
                      <div className="font-medium">{g.produto.descricao}</div>
                      <div className="text-xs text-slate-500">
                        {g.produto.codigo} · total {num(g.qtd)}
                        {g.qtd < g.produto.estoqueMinimo && <span className="ml-1 text-rose-600">(abaixo do mínimo {g.produto.estoqueMinimo})</span>}
                      </div>
                    </>
                  )}
                </Td>
                <Td className="font-mono text-xs">
                  <Link href={`/qualidade/lotes/${s.loteId}`} className="hover:underline">{s.lote.numero}</Link>
                </Td>
                <Td>
                  {date(s.lote.validade)} {dias < 0 ? <Badge color="red">vencido</Badge> : dias <= 30 ? <Badge color="yellow">{dias}d</Badge> : null}
                </Td>
                <Td><StatusBadge status={s.lote.status} /></Td>
                <Td>{s.local.nome}</Td>
                <Td className="font-semibold">{num(s.quantidade)}</Td>
                <Td>{money(s.quantidade * toNumber(g.produto.custoMedio))}</Td>
              </tr>
            );
          }),
        )}
      </Table>
    </>
  );
}
