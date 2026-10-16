import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Aviso, Badge, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { Totais } from "../../_componentes/totais";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
import { date, diasAte, money, num, toNumber } from "@/lib/format";
import { addDias, hojeUTC } from "@/lib/datas";
import type { Prisma } from "@/generated/prisma/client";
import { PERFIS_VER } from "../_lib/perfis";
import { soStrings } from "@/lib/search-params";

type SP = { local?: string; q?: string; status?: string };
const LIMITE = 2000; // linhas exibidas; os totais cobrem todas
const STATUS_LOTE = ["QUARENTENA", "LIBERADO", "NAO_CONFORME", "BLOQUEADO", "VENCIDO"];

export default async function SaldosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(PERFIS_VER);
  const verLote = ["ADMIN", "ESTOQUE", "QUALIDADE"].includes(user.perfil); // a tela do lote é da Qualidade
  const sp = soStrings(await searchParams);
  const filtroLote: Prisma.LoteWhereInput = STATUS_LOTE.includes(sp.status as never) ? { status: sp.status as never } : {}; // status fora da lista é ignorado
  const where: Prisma.SaldoWhereInput = {
    quantidade: { gt: 0 },
    ...(sp.local ? { localId: sp.local } : {}),
    lote: filtroLote,
    ...(sp.q ? { produto: { OR: [{ descricao: { contains: sp.q, mode: "insensitive" } }, { codigo: { contains: sp.q, mode: "insensitive" } }] } } : {}),
  };
  const hoje = hojeUTC(); // a validade é gravada 00:00Z
  const somaVencimento = (validade: Prisma.DateTimeFilter) =>
    db.saldo.aggregate({ where: { ...where, lote: { ...filtroLote, validade } }, _sum: { quantidade: true } }).then((r) => r._sum.quantidade ?? 0);
  // Os totais vêm do banco (sobre TODOS os saldos filtrados); só a lista é cortada em LIMITE linhas.
  const [locais, saldos, totalLinhas, porProdutoLocal, vencidos, vencendo] = await Promise.all([
    db.localEstoque.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
    db.saldo.findMany({
      where,
      include: { produto: true, lote: true, local: true },
      orderBy: [{ produto: { descricao: "asc" } }, { lote: { validade: "asc" } }],
      take: LIMITE,
    }),
    db.saldo.count({ where }),
    db.saldo.groupBy({ by: ["produtoId", "localId"], where, _sum: { quantidade: true } }),
    somaVencimento({ lt: hoje }),
    somaVencimento({ gte: hoje, lte: addDias(hoje, 30) }),
  ]);
  const custos = new Map(
    (await db.produto.findMany({ where: { id: { in: [...new Set(porProdutoLocal.map((r) => r.produtoId))] } }, select: { id: true, custoMedio: true } })).map((p) => [p.id, toNumber(p.custoMedio)]),
  );
  const nomeLocal = new Map(locais.map((l) => [l.id, l.nome]));
  let unidades = 0;
  let valorTotal = 0;
  const produtosTotal = new Set<string>();
  const porLocal = new Map<string, { nome: string; qtd: number; valor: number }>();
  for (const r of porProdutoLocal) {
    const q = r._sum.quantidade ?? 0;
    const valor = q * (custos.get(r.produtoId) ?? 0);
    unidades += q;
    valorTotal += valor;
    produtosTotal.add(r.produtoId);
    const l = porLocal.get(r.localId) ?? { nome: nomeLocal.get(r.localId) ?? "—", qtd: 0, valor: 0 };
    l.qtd += q;
    l.valor += valor;
    porLocal.set(r.localId, l);
  }

  // Agrupa por produto (só as linhas exibidas)
  const grupos = new Map<string, { produto: (typeof saldos)[number]["produto"]; linhas: typeof saldos; qtd: number }>();
  for (const s of saldos) {
    const g = grupos.get(s.produtoId) ?? { produto: s.produto, linhas: [], qtd: 0 };
    g.linhas.push(s);
    g.qtd += s.quantidade;
    grupos.set(s.produtoId, g);
  }

  return (
    <>
      <PageHeader title="Saldos por local" subtitle="Depósito, quarentena e consignado nos hospitais, por produto e lote." />
      <Totais
        itens={[
          { label: "Unidades", valor: `${num(unidades)} (${produtosTotal.size} produtos)` },
          { label: "Valor a custo médio", valor: money(valorTotal) },
          { label: "Vencendo em 30 dias", valor: `${num(vencendo)} un.`, tom: vencendo ? "warn" : "default" },
          { label: "Vencidos com saldo", valor: `${num(vencidos)} un.`, tom: vencidos ? "danger" : "default" },
        ]}
      />

      <Filtros limparHref="/estoque/saldos">
        <FiltroInput label="Produto" name="q" defaultValue={sp.q} placeholder="Produto ou código" className="w-full sm:w-56" />
        <FiltroSelect label="Local" name="local" defaultValue={sp.local} todos="Todos os locais" options={locais.map((l) => ({ value: l.id, label: l.nome }))} />
        <FiltroSelect
          label="Status do lote"
          name="status"
          defaultValue={sp.status}
          todos="Qualquer status"
          options={["LIBERADO", "QUARENTENA", "NAO_CONFORME", "BLOQUEADO", "VENCIDO"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))}
        />
      </Filtros>

      {totalLinhas > saldos.length && (
        <Aviso tom="alerta" className="mb-3">
          Mostrando {num(saldos.length)} de {num(totalLinhas)} linhas de saldo. Os totais acima já consideram todas; filtre por produto, local ou status para ver o restante.
        </Aviso>
      )}

      {!sp.local && porLocal.size > 0 && (
        <p className="mb-3 text-xs leading-6 text-slate-600">
          Por local:{" "}
          {[...porLocal.entries()].map(([id, l], i) => (
            <span key={id}>
              {i > 0 && <span className="text-slate-400"> · </span>}
              <Link href={`/estoque/saldos?local=${id}`} className="text-teal-700 hover:underline">{l.nome.replace(/^Consignado — /, "")}</Link>{" "}
              <span className="tnum">{num(l.qtd)} un · {money(l.valor)}</span>
            </span>
          ))}
        </p>
      )}

      <Table titulo="Saldos por produto e lote" contagem={grupos.size} head={["Produto", "Lote", { label: "Validade", hideOnMobile: true }, { label: "Situação", hideOnMobile: true }, { label: "Local", hideOnMobile: true }, "Qtd.", "Valor"]} empty={saldos.length === 0} emptyText="Nenhum saldo encontrado para os filtros informados. Ajuste o local ou o status do lote.">
        {[...grupos.values()].map((g) =>
          g.linhas.map((s, idx) => {
            const dias = diasAte(s.lote.validade);
            return (
              <tr key={s.id} className={idx === 0 ? "border-t-2 border-slate-200" : undefined}>
                <Td className="whitespace-normal max-sm:max-w-24">
                  {idx === 0 && (
                    <>
                      <div className="whitespace-normal font-medium text-teal-700">{g.produto.descricao}</div>
                      <div className="whitespace-normal text-xs text-slate-600">
                        {g.produto.codigo} · total {num(g.qtd)}
                        {g.qtd < g.produto.estoqueMinimo && <span className="ml-1 text-rose-600">(abaixo do mínimo {g.produto.estoqueMinimo})</span>}
                      </div>
                    </>
                  )}
                </Td>
                <Td className="font-mono text-xs">
                  {verLote ? <Link href={`/qualidade/lotes/${s.loteId}`} className="text-teal-700 hover:underline">{s.lote.numero}</Link> : s.lote.numero}
                </Td>
                <Td>
                  {date(s.lote.validade)} {dias < 0 ? <Badge color="red">vencido</Badge> : dias <= 30 ? <Badge color="yellow">{dias}d</Badge> : null}
                </Td>
                <Td><StatusBadge status={s.lote.status} /></Td>
                <Td>{s.local.nome}</Td>
                <Td className="tnum text-right font-semibold">{num(s.quantidade)}</Td>
                <Td className="tnum text-right">{money(s.quantidade * toNumber(g.produto.custoMedio))}</Td>
              </tr>
            );
          }),
        )}
      </Table>
    </>
  );
}
