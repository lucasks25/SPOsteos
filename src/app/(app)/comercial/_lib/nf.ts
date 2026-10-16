import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { diaBrasilia } from "@/lib/datas";
import { gerarContaReceberTx } from "@/app/(app)/financeiro/_lib/publico";

/** Registra a NF (número manual): pedido ABERTO vira FATURADO e nasce a conta a receber (plano RECEITA_VENDA, competência = dia do faturamento em Brasília). */
export async function registrarNfTx(tx: Tx, pedidoId: number, numeroNf: string, vencimento: Date, agora = new Date()) {
  const pedido = await tx.pedidoVenda.findUnique({ where: { id: pedidoId }, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } });
  if (!pedido) throw new ErroNegocio("Pedido não encontrado.");
  numeroNf = numeroNf.trim();
  if (!numeroNf) throw new ErroNegocio("Informe o número da NF.");
  if (vencimento.getTime() < diaBrasilia(agora).getTime()) throw new ErroNegocio("O vencimento não pode ser anterior à data da NF (hoje).");
  // mesma NF em dois pedidos = venda contada duas vezes no DRE e duas cobranças ao hospital
  const outra = await tx.pedidoVenda.findFirst({ where: { numeroNf, id: { not: pedidoId }, status: { not: "CANCELADO" } }, select: { id: true } });
  if (outra) throw new ErroNegocio(`A NF ${numeroNf} já está registrada no pedido PV-${outra.id}. Confira o número da nota.`);
  const r = await tx.pedidoVenda.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "FATURADO", numeroNf, faturadoEm: agora } });
  if (r.count === 0) throw new ErroNegocio("Só é possível registrar NF em pedidos abertos.");
  const total = toNumber(pedido.total);
  if (total <= 0) throw new ErroNegocio("O pedido tem valor zero. Confira os preços da tabela do hospital antes de faturar.");
  return gerarContaReceberTx(tx, {
    descricao: `PV-${pedidoId} — NF ${numeroNf} — ${pedido.hospital.nomeFantasia || pedido.hospital.razaoSocial}`,
    hospitalId: pedido.hospitalId,
    pedidoId,
    valor: total,
    vencimento,
    competencia: diaBrasilia(agora),
    centroCustoId: pedido.centroCustoId,
    chavePlano: "RECEITA_VENDA",
  });
}
