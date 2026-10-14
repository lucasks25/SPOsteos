"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { itensJson } from "../_lib/itens";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";
import { receberItemTx } from "../_lib/recebimento";
import { ErroNegocio } from "@/lib/erros";

const schemaPedido = z.object({
  fornecedorId: zf.text("Selecione o fornecedor"),
  previsao: zf.optDate(),
  importacao: zf.bool(),
  invoice: zf.optText(),
  numeroDi: zf.optText(),
  observacao: zf.optText(),
  itens: itensJson(),
});

export async function criarPedidoCompra(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const parsed = parseForm(schemaPedido, fd);
  if (!parsed.success) return parsed.state;
  const { itens, ...dados } = parsed.data;
  let id: number;
  try {
    const forn = await db.fornecedor.findUnique({ where: { id: dados.fornecedorId }, select: { ativo: true } });
    if (!forn?.ativo) return { error: "Fornecedor inexistente ou inativo." };
    const produtos = await db.produto.count({ where: { id: { in: itens.map((i) => i.produtoId) }, ativo: true } });
    if (produtos !== new Set(itens.map((i) => i.produtoId)).size) return { error: "Há produto inexistente ou inativo nos itens." };
    const pedido = await db.pedidoCompra.create({ data: { ...dados, itens: { create: itens } } });
    id = pedido.id;
    await audit(user.id, "criar", "PedidoCompra", id, `${documentoPedido(id)} — ${itens.length} item(ns)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/compras/pedidos");
  redirect(`/compras/pedidos/${id}`);
}

const schemaRecebimento = z.object({
  quantidade: z.coerce.number().int("Quantidade deve ser inteira").min(1, "Mínimo 1"),
  lote: zf.text("Informe o lote"),
  validade: zf.date("Informe a validade"),
  fabricacao: zf.optDate(),
  serie: zf.optText(),
});

/** Recebe uma quantidade de um item: lote em quarentena, entrada no kardex, custo médio e conta a pagar. */
export async function receberItem(pedidoId: number, itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const parsed = parseForm(schemaRecebimento, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction(async (tx) => {
      const item = await tx.pedidoCompraItem.findUnique({ where: { id: itemId }, select: { pedidoId: true } });
      if (item?.pedidoId !== pedidoId) throw new ErroNegocio("Item não pertence a este pedido.");
      await receberItemTx(tx, { itemId, ...parsed.data, usuario: user.nome });
    });
    await audit(user.id, "receber", "PedidoCompra", pedidoId, `${documentoPedido(pedidoId)} — lote ${parsed.data.lote}, ${parsed.data.quantidade} un.`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of [`/compras/pedidos/${pedidoId}`, "/compras/pedidos", "/qualidade/quarentena", "/financeiro/pagar", "/financeiro/fluxo", "/estoque/saldos"]) revalidatePath(p);
  return { ok: true };
}

/** Cancela um pedido ABERTO (sem nenhum recebimento). */
export async function cancelarPedidoCompra(pedidoId: number): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  try {
    const r = await db.pedidoCompra.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "CANCELADO" } });
    if (r.count === 0) return { error: "Só é possível cancelar pedidos em aberto, sem recebimentos." };
    await audit(user.id, "cancelar", "PedidoCompra", pedidoId, documentoPedido(pedidoId));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/compras/pedidos");
  revalidatePath(`/compras/pedidos/${pedidoId}`);
  return { ok: true };
}
