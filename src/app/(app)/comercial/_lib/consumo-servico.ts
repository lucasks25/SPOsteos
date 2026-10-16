import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { localDoHospital, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";

/** Status em que a cirurgia aceita consumo. FATURADA e CANCELADA são recusadas (consumo ali não seria faturado). */
const ACEITAM_CONSUMO = ["AGENDADA", "CONFIRMADA", "REALIZADA"];

export type ItemConsumo = { produtoId: string; loteId: string; quantidade: number };

async function cirurgiaParaConsumo(tx: Tx, cirurgiaId: string) {
  const c = await tx.cirurgia.findUnique({ where: { id: cirurgiaId } });
  if (!c) throw new ErroNegocio("Cirurgia não encontrada.");
  if (!ACEITAM_CONSUMO.includes(c.status)) {
    throw new ErroNegocio(`Não é possível registrar consumo em cirurgia ${c.status.toLowerCase()}.`);
  }
  return c;
}

/**
 * API pública do comercial (via _lib/publico.ts): grava as linhas de consumo da cirurgia e a marca como REALIZADA.
 * Regra única de status: aceita AGENDADA, CONFIRMADA e REALIZADA (esta permanece); recusa FATURADA e CANCELADA
 * com ErroNegocio. NÃO movimenta estoque: quem chama já baixou o saldo com movimentar(). Roda dentro de $transaction.
 */
export async function registrarConsumoCirurgiaTx(tx: Tx, cirurgiaId: string, itens: ItemConsumo[]) {
  const c = await cirurgiaParaConsumo(tx, cirurgiaId);
  for (const i of itens) {
    if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) throw new ErroNegocio("Quantidade de consumo inválida.");
    await tx.cirurgiaConsumo.create({ data: { cirurgiaId, produtoId: i.produtoId, loteId: i.loteId, quantidade: i.quantidade } });
  }
  if (c.status !== "REALIZADA") await tx.cirurgia.update({ where: { id: cirurgiaId }, data: { status: "REALIZADA" } });
  return c;
}

/** Consumo direto a partir do estoque consignado já existente no hospital da cirurgia. */
export async function registrarConsumoDiretoTx(tx: Tx, input: { cirurgiaId: string; loteId: string; quantidade: number; usuario: string }) {
  const { cirurgiaId, loteId, quantidade, usuario } = input;
  const c = await cirurgiaParaConsumo(tx, cirurgiaId);
  const lote = await tx.lote.findUnique({ where: { id: loteId }, include: { produto: true } });
  if (!lote) throw new ErroNegocio("Lote não encontrado.");
  if (lote.status !== "LIBERADO") throw new ErroNegocio(`Lote ${lote.numero} não está liberado (${lote.status.toLowerCase()}).`);
  if (lote.validade.getTime() < hojeUTC().getTime()) throw new ErroNegocio(`Lote ${lote.numero} está vencido.`);
  const localId = await localDoHospital(tx, c.hospitalId);
  await movimentar(tx, {
    tipo: "CONSUMO",
    produtoId: lote.produtoId,
    loteId: lote.id,
    quantidade,
    origemId: localId,
    destinoId: null,
    custoUnit: toNumber(lote.produto.custoMedio),
    documento: `CIR-${c.numero}`,
    observacao: `Consumo direto — paciente ${c.paciente}`,
    usuario,
  });
  await registrarConsumoCirurgiaTx(tx, cirurgiaId, [{ produtoId: lote.produtoId, loteId: lote.id, quantidade }]);
  return c;
}

/** Remove uma linha de consumo, devolvendo a quantidade ao estoque consignado do hospital (estorno). Devolve o id da cirurgia. */
export async function removerConsumoTx(tx: Tx, consumoId: string, usuario: string) {
  const consumo = await tx.cirurgiaConsumo.findUnique({ where: { id: consumoId }, include: { cirurgia: true, produto: true } });
  if (!consumo) throw new ErroNegocio("Consumo não encontrado.");
  const c = consumo.cirurgia;
  if (c.status === "FATURADA" || c.status === "CANCELADA") throw new ErroNegocio(`Cirurgia ${c.status.toLowerCase()}: consumo não pode ser removido.`);
  const localId = await localDoHospital(tx, c.hospitalId);
  await movimentar(tx, {
    tipo: "AJUSTE",
    produtoId: consumo.produtoId,
    loteId: consumo.loteId,
    quantidade: consumo.quantidade,
    origemId: null,
    destinoId: localId,
    custoUnit: toNumber(consumo.produto.custoMedio),
    documento: `CIR-${c.numero}`,
    observacao: "estorno",
    usuario,
  });
  await tx.cirurgiaConsumo.delete({ where: { id: consumoId } });
  const restantes = await tx.cirurgiaConsumo.count({ where: { cirurgiaId: c.id } });
  if (restantes === 0 && c.status === "REALIZADA") {
    await tx.cirurgia.update({ where: { id: c.id }, data: { status: "CONFIRMADA" } });
  }
  return c.id;
}
