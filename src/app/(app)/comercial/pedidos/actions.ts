"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money, toNumber } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { registrarNfTx } from "../_lib/nf";
import { cancelarPedidoVendaTx } from "../_lib/pedido-servico";

const PERFIS = ["COMERCIAL", "FINANCEIRO"] as const;

function revalidar(id: number) {
  for (const p of ["/comercial/pedidos", `/comercial/pedidos/${id}`, "/comercial/cirurgias", "/financeiro/receber", "/financeiro/fluxo", "/"]) revalidatePath(p);
}

const schemaNf = z.object({
  numeroNf: zf.text("Informe o número da NF").pipe(z.string().max(30, "Número muito longo")),
  vencimento: zf.date("Informe o vencimento"),
});

/** Registra a NF (número manual), marca o pedido como FATURADO e gera a conta a receber. */
export async function registrarNf(pedidoId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  const parsed = parseForm(schemaNf, fd);
  if (!parsed.success) return parsed.state;
  const { numeroNf, vencimento } = parsed.data;
  try {
    await db.$transaction((tx) => registrarNfTx(tx, pedidoId, numeroNf, vencimento));
    await audit(user.id, "registrar NF", "PedidoVenda", pedidoId, `NF ${numeroNf}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}

/** Cancela um pedido ABERTO; a cirurgia volta a REALIZADA e pode ser faturada de novo. */
export async function cancelarPedidoVenda(pedidoId: number): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    const p = await db.$transaction((tx) => cancelarPedidoVendaTx(tx, pedidoId));
    await audit(user.id, "cancelar", "PedidoVenda", pedidoId, money(toNumber(p.total)));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}
