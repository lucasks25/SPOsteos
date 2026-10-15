import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { PERFIS_COMPRAS } from "../../_lib/perfis";
import { PedidoCompraForm } from "../pedido-form";

type SP = Record<string, string | string[] | undefined>;

export default async function NovoPedidoCompraPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(PERFIS_COMPRAS);
  const sp = await searchParams;
  const [fornecedores, produtos] = await Promise.all([
    db.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, custoMedio: true } }),
  ]);
  // vindo da sugestão de compra: ?produto=<id>&qtd=<n> (repetível)
  const ids = [sp.produto].flat().filter((v): v is string => typeof v === "string");
  const qtds = [sp.qtd].flat();
  const itensIniciais = ids.map((produtoId, i) => ({ produtoId, quantidade: Math.max(1, Math.floor(Number(qtds[i])) || 1) }));
  return (
    <>
      <PageHeader title="Novo pedido de compra" subtitle="Escolha o fornecedor e os produtos; o recebimento é registrado depois, no pedido." />
      <Card>
        <PedidoCompraForm
          fornecedores={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
          produtos={produtos.map((p) => ({ ...p, custoMedio: toNumber(p.custoMedio) }))}
          itensIniciais={itensIniciais}
        />
      </Card>
    </>
  );
}
