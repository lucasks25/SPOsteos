import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { btn, KpiGrid, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { diasAtras, money, num, toNumber } from "@/lib/format";
import { hojeUTC, PERFIS_COMPRAS } from "../_lib/perfis";

const DIAS_CONSUMO = 90;

/**
 * Sugestão de compra por produto:
 *   sugestão = max(0, mínimo + consumo médio mensal − disponível − pendente)
 * disponível = lotes LIBERADO e não vencidos no depósito e consignados nos hospitais.
 */
export default async function SugestaoPage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  await requireUser(PERFIS_COMPRAS);
  const { todos } = await searchParams;
  const hoje = hojeUTC();
  const desde = diasAtras(DIAS_CONSUMO);
  const [produtos, disponivel, quarentena, pendentes, consumo] = await Promise.all([
    db.produto.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true, estoqueMinimo: true, custoMedio: true }, orderBy: { descricao: "asc" } }),
    db.saldo.groupBy({
      by: ["produtoId"],
      where: { quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: hoje } } },
      _sum: { quantidade: true },
    }),
    db.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, local: { tipo: "QUARENTENA" } }, _sum: { quantidade: true } }),
    db.pedidoCompraItem.findMany({ where: { pedido: { status: { in: ["ABERTO", "PARCIAL"] } } }, select: { produtoId: true, quantidade: true, recebido: true } }),
    db.movimento.groupBy({ by: ["produtoId"], where: { tipo: "CONSUMO", criadoEm: { gte: desde } }, _sum: { quantidade: true } }),
  ]);
  const mapa = (rows: { produtoId: string; _sum: { quantidade: number | null } }[]) => new Map(rows.map((r) => [r.produtoId, r._sum.quantidade ?? 0]));
  const disp = mapa(disponivel);
  const quar = mapa(quarentena);
  const cons = mapa(consumo);
  const pend = new Map<string, number>();
  for (const p of pendentes) pend.set(p.produtoId, (pend.get(p.produtoId) ?? 0) + Math.max(0, p.quantidade - p.recebido));

  const linhas = produtos.map((p) => {
    const d = disp.get(p.id) ?? 0;
    const pe = pend.get(p.id) ?? 0;
    const c = cons.get(p.id) ?? 0;
    const mensal = Math.ceil(c / (DIAS_CONSUMO / 30));
    const sugestao = Math.max(0, p.estoqueMinimo + mensal - d - pe);
    return { ...p, d, q: quar.get(p.id) ?? 0, pe, c, mensal, sugestao, valor: sugestao * toNumber(p.custoMedio) };
  });
  const comSugestao = linhas.filter((l) => l.sugestao > 0);
  const exibidas = todos ? linhas : comSugestao;
  const urlPedido = (itens: typeof linhas) => {
    const q = new URLSearchParams();
    for (const l of itens) {
      q.append("produto", l.id);
      q.append("qtd", String(l.sugestao));
    }
    return `/compras/pedidos/novo?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Sugestão de compra"
        subtitle={`Quanto comprar de cada produto: mínimo + consumo médio mensal (últimos ${DIAS_CONSUMO} dias) − disponível − pendente em pedidos.`}
        actions={comSugestao.length > 0 && <LinkButton href={urlPedido(comSugestao)}>Gerar pedido com todas as sugestões</LinkButton>}
      />
      <KpiGrid cols={3}>
        <Stat label="Produtos a comprar" value={num(comSugestao.length)} tone={comSugestao.length ? "warn" : "default"} />
        <Stat label="Unidades sugeridas" value={num(comSugestao.reduce((s, l) => s + l.sugestao, 0))} />
        <Stat label="Valor estimado (custo médio)" value={money(comSugestao.reduce((s, l) => s + l.valor, 0))} />
      </KpiGrid>
      <div className="mb-3 flex justify-end">
        {todos ? (
          <Link href="/compras/sugestao" className={btn.secondary}>Mostrar só produtos com sugestão</Link>
        ) : (
          <Link href="/compras/sugestao?todos=1" className={btn.secondary}>Mostrar todos os produtos</Link>
        )}
      </div>
      <Table head={["Produto", "Disponível", "Quarentena", "Pendente", `Consumo ${DIAS_CONSUMO}d`, "Média/mês", "Mínimo", "Sugestão", "Valor", ""]} empty={exibidas.length === 0} emptyText={todos ? "Nenhum produto ativo cadastrado." : "Nenhum produto precisa de compra agora: o estoque disponível cobre o mínimo e o consumo."}>
        {exibidas.map((l) => (
          <tr key={l.id}>
            <Td className="max-w-sm truncate">
              <span className="font-mono text-xs text-slate-500">{l.codigo}</span> {l.descricao}
            </Td>
            <Td className={l.d < l.estoqueMinimo ? "text-right text-rose-600" : "text-right"}>{num(l.d)}</Td>
            <Td className="text-right">{num(l.q)}</Td>
            <Td className="text-right">{num(l.pe)}</Td>
            <Td className="text-right">{num(l.c)}</Td>
            <Td className="text-right">{num(l.mensal)}</Td>
            <Td className="text-right">{num(l.estoqueMinimo)}</Td>
            <Td className="text-right font-semibold">{num(l.sugestao)}</Td>
            <Td className="text-right">{money(l.valor)}</Td>
            <Td>{l.sugestao > 0 && <Link href={urlPedido([l])} className={btn.small}>Pedir</Link>}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
