import "server-only";
import type { Tx } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { precosDoHospital } from "./precos";
import { ErroNegocio } from "@/lib/erros";

export class FaturamentoError extends ErroNegocio {}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Gera o Pedido de Venda de uma cirurgia REALIZADA a partir do consumo apurado
 * (agrupado por produto + lote). Preço: tabela do hospital (vigente na data da
 * cirurgia) ou preço base; custo: custo médio do produto; comissão: % do representante.
 * Deve ser chamada dentro de uma transação. Retorna o pedido criado.
 */
export async function faturarCirurgia(tx: Tx, cirurgiaId: string) {
  const cirurgia = await tx.cirurgia.findUnique({
    where: { id: cirurgiaId },
    include: {
      consumos: { include: { lote: { select: { numero: true } } } },
      pedido: true,
      representante: true,
    },
  });
  if (!cirurgia) throw new FaturamentoError("Cirurgia não encontrada.");
  if (cirurgia.status !== "REALIZADA") throw new FaturamentoError("Só é possível faturar cirurgias com status REALIZADA.");
  if (cirurgia.consumos.length === 0) throw new FaturamentoError("A cirurgia não possui consumo registrado.");
  if (cirurgia.pedido) {
    if (cirurgia.pedido.status !== "CANCELADO") {
      throw new FaturamentoError(`A cirurgia já possui o pedido de venda PV-${cirurgia.pedido.id}.`);
    }
    // pedido cancelado anteriormente (sem títulos): libera o vínculo único para o novo pedido
    await tx.pedidoVenda.delete({ where: { id: cirurgia.pedido.id } });
  }

  // agrupa por produto + lote
  const grupos = new Map<string, { produtoId: string; loteNumero: string; quantidade: number }>();
  for (const c of cirurgia.consumos) {
    const key = `${c.produtoId}|${c.loteId}`;
    const g = grupos.get(key);
    if (g) g.quantidade += c.quantidade;
    else grupos.set(key, { produtoId: c.produtoId, loteNumero: c.lote.numero, quantidade: c.quantidade });
  }
  const itens = [...grupos.values()];
  const precos = await precosDoHospital(tx, cirurgia.hospitalId, itens.map((i) => i.produtoId), cirurgia.dataHora);

  let total = 0;
  let custoTotal = 0;
  const data = itens.map((i) => {
    const p = precos.get(i.produtoId) ?? { preco: 0, custo: 0 };
    total += r2(p.preco * i.quantidade);
    custoTotal += r2(p.custo * i.quantidade);
    return { produtoId: i.produtoId, loteNumero: i.loteNumero, quantidade: i.quantidade, precoUnit: p.preco, custoUnit: p.custo };
  });
  total = r2(total);
  custoTotal = r2(custoTotal);
  const percent = cirurgia.representante ? toNumber(cirurgia.representante.comissaoPercent) : 0;
  const comissao = r2((total * percent) / 100);

  const pedido = await tx.pedidoVenda.create({
    data: {
      hospitalId: cirurgia.hospitalId,
      cirurgiaId: cirurgia.id,
      representanteId: cirurgia.representanteId,
      status: "ABERTO",
      total,
      custoTotal,
      comissao,
      itens: { create: data },
    },
  });
  await tx.cirurgia.update({ where: { id: cirurgia.id }, data: { status: "FATURADA" } });
  return pedido;
}
