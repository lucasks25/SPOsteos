import "server-only";
import type { Tx } from "@/lib/db";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { documentoPedido, hojeUTC } from "./perfis";
import { planoPorChave } from "@/app/(app)/financeiro/_lib/plano";
import { ErroNegocio } from "@/lib/erros";

export type RecebimentoInput = {
  itemId: string;
  quantidade: number;
  lote: string;
  validade: Date;
  fabricacao: Date | null;
  serie: string | null;
  usuario: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Recebe uma quantidade de um item do pedido de compra (tudo dentro da transação):
 * lote (novo entra em QUARENTENA), ENTRADA na quarentena, recebido do item,
 * custo médio ponderado do produto, status do pedido e conta a pagar.
 */
export async function receberItemTx(tx: Tx, r: RecebimentoInput) {
  const item = await tx.pedidoCompraItem.findUnique({
    where: { id: r.itemId },
    include: { pedido: { include: { fornecedor: true } }, produto: true },
  });
  if (!item) throw new ErroNegocio("Item do pedido não encontrado.");
  const pedido = item.pedido;
  if (pedido.status === "CANCELADO" || pedido.status === "RECEBIDO") {
    throw new ErroNegocio(`Pedido ${pedido.status === "CANCELADO" ? "cancelado" : "já recebido"} — não é possível receber.`);
  }
  const pendente = item.quantidade - item.recebido;
  if (r.quantidade > pendente) {
    throw new ErroNegocio(`Quantidade maior que a pendente (${pendente}) para ${item.produto.descricao}.`);
  }
  if (r.validade < hojeUTC()) throw new ErroNegocio("Validade informada já está vencida.");
  if (r.fabricacao && r.fabricacao > r.validade) throw new ErroNegocio("Data de fabricação posterior à validade.");

  // Lote (produtoId + numero)
  const existente = await tx.lote.findUnique({ where: { produtoId_numero: { produtoId: item.produtoId, numero: r.lote } } });
  let loteId: string;
  if (existente) {
    if (existente.validade.getTime() !== r.validade.getTime()) {
      throw new ErroNegocio(`O lote ${r.lote} já existe com validade diferente. Verifique os dados.`);
    }
    loteId = existente.id;
    const extra: { serie?: string; fabricacao?: Date } = {};
    if (r.serie && !existente.serie) extra.serie = r.serie;
    if (r.fabricacao && !existente.fabricacao) extra.fabricacao = r.fabricacao;
    if (Object.keys(extra).length) await tx.lote.update({ where: { id: loteId }, data: extra });
  } else {
    const novo = await tx.lote.create({
      data: {
        produtoId: item.produtoId,
        numero: r.lote,
        serie: r.serie,
        fabricacao: r.fabricacao,
        validade: r.validade,
        status: "QUARENTENA",
      },
    });
    loteId = novo.id;
  }

  // Custo médio ponderado (calculado com o saldo ANTES da entrada)
  const custo = Number(item.custoUnit.toString());
  const agg = await tx.saldo.aggregate({ where: { produtoId: item.produtoId }, _sum: { quantidade: true } });
  const saldoAtual = Math.max(0, agg._sum.quantidade ?? 0);
  const custoAtual = Number(item.produto.custoMedio.toString());
  const novoCusto = round2((saldoAtual * custoAtual + r.quantidade * custo) / (saldoAtual + r.quantidade));
  await tx.produto.update({ where: { id: item.produtoId }, data: { custoMedio: novoCusto } });

  const documento = documentoPedido(pedido.id);
  await movimentar(tx, {
    tipo: "ENTRADA",
    produtoId: item.produtoId,
    loteId,
    quantidade: r.quantidade,
    destinoId: LOCAIS.QUARENTENA,
    custoUnit: custo,
    documento,
    observacao: `Recebimento ${pedido.fornecedor.razaoSocial}`,
    usuario: r.usuario,
  });

  // Atualiza recebido de forma atômica e confere o limite
  const atualizado = await tx.pedidoCompraItem.update({ where: { id: item.id }, data: { recebido: { increment: r.quantidade } } });
  if (atualizado.recebido > atualizado.quantidade) throw new ErroNegocio("Quantidade recebida excede a pedida.");

  const itens = await tx.pedidoCompraItem.findMany({ where: { pedidoId: pedido.id }, select: { quantidade: true, recebido: true } });
  const completo = itens.every((i) => i.recebido >= i.quantidade);
  await tx.pedidoCompra.update({ where: { id: pedido.id }, data: { status: completo ? "RECEBIDO" : "PARCIAL" } });

  const valor = round2(r.quantidade * custo);
  if (valor > 0) {
    await tx.contaPagar.create({
      data: {
        descricao: `${documento} — ${pedido.fornecedor.nomeFantasia ?? pedido.fornecedor.razaoSocial}`,
        fornecedorId: pedido.fornecedorId,
        pedidoId: pedido.id,
        categoria: "Compra de mercadoria",
        valor,
        competencia: hojeUTC(),
        planoContaId: await planoPorChave(tx, "ESTOQUE"),
        vencimento: new Date(hojeUTC().getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return { pedidoId: pedido.id, loteId, valor, completo };
}
