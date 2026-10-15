import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { diaBrasilia } from "@/app/(app)/financeiro/_lib/datas";
import { planoPorChave } from "@/app/(app)/financeiro/_lib/plano";

/** Registra a NF (número manual): pedido ABERTO vira FATURADO e nasce a conta a receber (plano RECEITA_VENDA, competência = dia do faturamento em Brasília). */
export async function registrarNfTx(tx: Tx, pedidoId: number, numeroNf: string, vencimento: Date, agora = new Date()) {
  const pedido = await tx.pedidoVenda.findUnique({ where: { id: pedidoId }, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } });
  if (!pedido) throw new ErroNegocio("Pedido não encontrado.");
  const r = await tx.pedidoVenda.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "FATURADO", numeroNf, faturadoEm: agora } });
  if (r.count === 0) throw new ErroNegocio("Só é possível registrar NF em pedidos abertos.");
  const total = toNumber(pedido.total);
  if (total <= 0) throw new ErroNegocio("O pedido tem valor zero. Confira os preços da tabela do hospital antes de faturar.");
  return tx.contaReceber.create({
    data: {
      descricao: `PV-${pedidoId} — NF ${numeroNf} — ${pedido.hospital.nomeFantasia || pedido.hospital.razaoSocial}`,
      hospitalId: pedido.hospitalId,
      pedidoId,
      valor: total,
      vencimento,
      competencia: diaBrasilia(agora),
      planoContaId: await planoPorChave(tx, "RECEITA_VENDA"),
      centroCustoId: pedido.centroCustoId,
    },
  });
}
