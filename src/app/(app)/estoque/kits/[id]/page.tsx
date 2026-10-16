import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../../_lib/perfis";
import { KitForm } from "../kit-form";
import { adicionarItemKit, excluirKit, removerItemKit } from "../actions";
import { hojeUTC } from "@/lib/datas";

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER);
  const { id } = await params;
  const [kit, produtos, disponivel] = await Promise.all([
    db.kit.findUnique({ where: { id }, include: { itens: { include: { produto: true }, orderBy: { produto: { descricao: "asc" } } }, _count: { select: { remessas: true } } } }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    db.saldo.groupBy({ by: ["produtoId"], where: { localId: "local-deposito", quantidade: { gt: 0 }, lote: { status: "LIBERADO", validade: { gte: hojeUTC() } } }, _sum: { quantidade: true } }),
  ]);
  if (!kit) notFound();
  const disp = new Map(disponivel.map((d) => [d.produtoId, d._sum.quantidade ?? 0]));
  const edita = podeEditar(user.perfil);
  const montaveis = kit.itens.length ? Math.min(...kit.itens.map((i) => Math.floor((disp.get(i.produtoId) ?? 0) / i.quantidade))) : 0;
  return (
    <>
      <PageHeader
        title={`${kit.codigo} — ${kit.descricao}`}
        voltar={{ href: "/estoque/kits", label: "Caixas e kits" }}
        meta={[`${kit._count.remessas} remessa(s) · ${montaveis} kit(s) completo(s) disponíveis no depósito`]}
        actions={
          edita && kit._count.remessas === 0 && (
            <ActionButton action={excluirKit.bind(null, id)} variant="danger" confirm="Excluir este kit?">Excluir</ActionButton>
          )
        }
      />
      <KpiGrid cols={3}>
        <Stat label="Itens no kit" value={kit.itens.length} hint={`${num(kit.itens.reduce((n, i) => n + i.quantidade, 0))} unidade(s)`} />
        <Stat label="Kits completos no depósito" value={montaveis} hint={<span className={montaveis > 0 ? "text-emerald-700" : "text-amber-700"}>{montaveis > 0 ? "disponíveis" : "falta material"}</span>} tone={montaveis > 0 ? "default" : "warn"} />
        <Stat label="Remessas geradas" value={kit._count.remessas} />
      </KpiGrid>
      <div className="space-y-3">
        {edita && (
          <Card title="Dados do kit">
            <KitForm kit={kit} />
          </Card>
        )}
        {edita && (
          <Card title="Incluir item">
            <ItemAdder action={adicionarItemKit.bind(null, id)} produtos={produtoOptions(produtos)} />
          </Card>
        )}
        <Table titulo="Itens do kit" contagem={kit.itens.length} head={["Produto", "Qtd. no kit", "Disponível no depósito", ...(edita ? ["Ações"] : [])]} empty={kit.itens.length === 0} emptyText="Este kit ainda não tem itens. Use o campo acima para incluir produtos.">
          {kit.itens.map((i) => {
            const d = disp.get(i.produtoId) ?? 0;
            return (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium">{i.produto.descricao}</div>
                  <div className="font-mono text-xs text-slate-500">{i.produto.codigo}</div>
                </Td>
                <Td className="tnum text-right">{i.quantidade}</Td>
                <Td className={d < i.quantidade ? "tnum text-right text-rose-600" : "tnum text-right"}>{num(d)}</Td>
                {edita && <Td><ActionButton action={removerItemKit.bind(null, i.id)} variant="small">Remover</ActionButton></Td>}
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
