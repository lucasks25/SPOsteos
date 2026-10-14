"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money, toNumber } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { ErroNegocio } from "@/lib/erros";

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
    await db.$transaction(async (tx) => {
      const pedido = await tx.pedidoVenda.findUnique({ where: { id: pedidoId }, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } });
      if (!pedido) throw new ErroNegocio("Pedido não encontrado.");
      const r = await tx.pedidoVenda.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "FATURADO", numeroNf, faturadoEm: new Date() } });
      if (r.count === 0) throw new ErroNegocio("Só é possível registrar NF em pedidos abertos.");
      const total = toNumber(pedido.total);
      if (total <= 0) throw new ErroNegocio("O pedido tem valor zero. Confira os preços da tabela do hospital antes de faturar.");
      await tx.contaReceber.create({
        data: {
          descricao: `PV-${pedidoId} — NF ${numeroNf} — ${pedido.hospital.nomeFantasia || pedido.hospital.razaoSocial}`,
          hospitalId: pedido.hospitalId,
          pedidoId,
          valor: total,
          vencimento,
        },
      });
    });
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
    await db.$transaction(async (tx) => {
      const r = await tx.pedidoVenda.updateMany({ where: { id: pedidoId, status: "ABERTO" }, data: { status: "CANCELADO" } });
      if (r.count === 0) throw new ErroNegocio("Só é possível cancelar pedidos em aberto (sem NF).");
      const p = await tx.pedidoVenda.findUniqueOrThrow({ where: { id: pedidoId }, select: { cirurgiaId: true, total: true } });
      if (p.cirurgiaId) await tx.cirurgia.updateMany({ where: { id: p.cirurgiaId, status: "FATURADA" }, data: { status: "REALIZADA" } });
      await audit(user.id, "cancelar", "PedidoVenda", pedidoId, money(toNumber(p.total)));
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}
