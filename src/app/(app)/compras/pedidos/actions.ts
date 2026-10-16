"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argInt } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { itensJson } from "../_lib/itens";
import { INCOTERMS, MOEDAS } from "../_lib/custo-importacao";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";
import { receberItemTx } from "../_lib/recebimento";
import { cancelarPedidoCompraTx } from "../_lib/cancelamento-servico";
import { ErroNegocio } from "@/lib/erros";

const schemaPedido = z.object({
  fornecedorId: zf.text("Selecione o fornecedor"),
  previsao: zf.optDate(),
  importacao: zf.bool(),
  invoice: zf.optText(),
  numeroDi: zf.optText(),
  moeda: z.enum(MOEDAS).optional(),
  cambio: zf.optMoney(),
  incoterm: z.union([z.enum(INCOTERMS), z.literal("")]).optional().transform((v) => v || null),
  observacao: zf.optText(),
  itens: itensJson(),
}).superRefine((d, ctx) => {
  if (d.importacao && d.moeda && d.moeda !== "BRL" && !(d.cambio && d.cambio > 0)) ctx.addIssue({ code: "custom", path: ["cambio"], message: "Informe o câmbio (estimativa; pode ser ajustado até o primeiro recebimento)" });
});

export async function criarPedidoCompra(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const parsed = parseForm(schemaPedido, fd);
  if (!parsed.success) return parsed.state;
  const { itens: itensForm, moeda: moedaForm, cambio: cambioForm, incoterm, ...dados } = parsed.data;
  // Importação: o preço digitado é na moeda do pedido; custoUnit fica em reais (preço × câmbio)
  const moeda = dados.importacao ? (moedaForm ?? "BRL") : "BRL";
  const cambio = moeda === "BRL" ? null : cambioForm;
  const itens = dados.importacao
    ? itensForm.map((i) => ({ ...i, precoMoeda: i.custoUnit, custoUnit: Math.round(i.custoUnit * (cambio ?? 1) * 100) / 100 }))
    : itensForm;
  const extra = dados.importacao ? { moeda, cambio, tipoCambio: cambio ? ("PTAX" as const) : null, incoterm } : { invoice: null, numeroDi: null };
  let id: number;
  try {
    const forn = await db.fornecedor.findUnique({ where: { id: dados.fornecedorId }, select: { ativo: true } });
    if (!forn?.ativo) return { error: "Fornecedor inexistente ou inativo." };
    const produtos = await db.produto.count({ where: { id: { in: itens.map((i) => i.produtoId) }, ativo: true } });
    if (produtos !== new Set(itens.map((i) => i.produtoId)).size) return { error: "Há produto inexistente ou inativo nos itens." };
    const pedido = await db.pedidoCompra.create({ data: { ...dados, ...extra, itens: { create: itens } } });
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
  pedidoId = argInt(pedidoId);
  itemId = argId(itemId);
  const parsed = parseForm(schemaRecebimento, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction(async (tx) => {
      const item = await tx.pedidoCompraItem.findUnique({ where: { id: itemId }, select: { pedidoId: true } });
      if (item?.pedidoId !== pedidoId) throw new ErroNegocio("Item não pertence a este pedido.");
      await receberItemTx(tx, { itemId, ...parsed.data, usuario: user.nome, usuarioId: user.id });
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
  pedidoId = argInt(pedidoId);
  try {
    const r = await db.$transaction((tx) => cancelarPedidoCompraTx(tx, pedidoId));
    await audit(user.id, "cancelar", "PedidoCompra", pedidoId, `${documentoPedido(pedidoId)}${r.contasCanceladas ? ` — ${r.contasCanceladas} conta(s) a pagar de despesa cancelada(s)` : ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/compras/pedidos");
  revalidatePath(`/compras/pedidos/${pedidoId}`);
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/aprovacoes");
  return { ok: true };
}
