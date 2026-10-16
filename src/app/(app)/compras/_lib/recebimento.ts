import "server-only";
import type { Tx } from "@/lib/db";
import { LOCAIS, atualizarCustoMedio, movimentar } from "@/lib/estoque";
import { hojeUTC } from "@/lib/datas";
import { documentoPedido } from "./perfis";
import { gerarContaPagarTx } from "@/app/(app)/financeiro/_lib/publico";
import { registrarLoteRecebidoTx } from "@/app/(app)/qualidade/_lib/publico";
import { ErroNegocio } from "@/lib/erros";
import { reais, valorRecebimentoCent } from "./custo-importacao";
import { custoDoPedido, travarPedido } from "./importacao-servico";

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
 *
 * Custo (sempre em REAIS):
 * - pedido nacional: custoUnit do item;
 * - importação: custo NACIONALIZADO (preço na moeda × câmbio + rateio das despesas que integram o custo). O estoque e o
 *   custo médio recebem esse valor; a conta a pagar do fornecedor recebe só a mercadoria (preço × câmbio). As despesas
 *   têm contas a pagar próprias (opcionais), lançadas em ESTOQUE quando integram o custo.
 * Recebimentos parciais usam a diferença de valores acumulados, então a soma das entregas fecha no centavo.
 * A linha do pedido fica travada (FOR UPDATE) durante a transação: recebimentos simultâneos e alteração de despesas
 * esperam um ao outro.
 */
export async function receberItemTx(tx: Tx, r: RecebimentoInput) {
  const ref = await tx.pedidoCompraItem.findUnique({ where: { id: r.itemId }, select: { pedidoId: true } });
  if (!ref) throw new ErroNegocio("Item do pedido não encontrado.");
  const travado = await travarPedido(tx, ref.pedidoId);
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

  // Lote (produtoId + numero): novo entra em QUARENTENA (regra da qualidade)
  const loteId = await registrarLoteRecebidoTx(tx, { produtoId: item.produtoId, numero: r.lote, validade: r.validade, fabricacao: r.fabricacao, serie: r.serie });

  // Valores em reais desta entrega: estoque (custo) e fornecedor (conta a pagar)
  let valorEstoque: number;
  let valorFornecedor: number;
  if (pedido.importacao) {
    const linha = custoDoPedido(travado).linhas.find((l) => l.id === item.id)!;
    valorEstoque = reais(valorRecebimentoCent(linha.totalCent, item.quantidade, item.recebido, r.quantidade));
    valorFornecedor = reais(valorRecebimentoCent(linha.valorReaisCent, item.quantidade, item.recebido, r.quantidade));
  } else {
    valorEstoque = valorFornecedor = round2(r.quantidade * Number(item.custoUnit.toString()));
  }
  const custo = round2(valorEstoque / r.quantidade); // custo unitário do kardex (2 casas)

  // Custo médio ponderado (saldo ANTES da entrada), com o produto travado: o pedido já está travado, então a ordem é pedido → produto
  await atualizarCustoMedio(tx, item.produtoId, r.quantidade, valorEstoque);

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

  const valor = valorFornecedor;
  if (valor > 0) {
    await gerarContaPagarTx(tx, {
      descricao: `${documento} — ${pedido.fornecedor.nomeFantasia ?? pedido.fornecedor.razaoSocial}`,
      fornecedorId: pedido.fornecedorId,
      pedidoId: pedido.id,
      categoria: "Compra de mercadoria",
      valor,
      competencia: hojeUTC(),
      vencimento: new Date(hojeUTC().getTime() + 30 * 24 * 60 * 60 * 1000),
      chavePlano: "ESTOQUE",
    });
  }

  return { pedidoId: pedido.id, loteId, valor, valorEstoque, custoUnit: custo, completo };
}
