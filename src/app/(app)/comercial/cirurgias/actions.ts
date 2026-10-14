"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { localDoHospital, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { parseDataHoraSP, hojeUTC } from "../_lib/datas";
import { faturarCirurgia } from "../_lib/faturamento";
import { ErroNegocio } from "@/lib/erros";

const EDITAM = ["COMERCIAL"] as const;

const schema = z.object({
  dataHora: z
    .string({ error: "Data/hora obrigatória" })
    .transform((v, ctx) => {
      const d = parseDataHoraSP(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Data/hora inválida" });
        return z.NEVER;
      }
      return d;
    }),
  hospitalId: zf.text("Selecione o hospital"),
  medicoId: zf.text("Selecione o médico"),
  convenioId: zf.optText(),
  procedimentoId: zf.optText(),
  representanteId: zf.optText(),
  paciente: zf.text("Informe o paciente"),
  carteirinha: zf.optText(),
  sus: zf.bool(),
  observacao: zf.optText(),
});

function revalidar(id?: string) {
  revalidatePath("/comercial/cirurgias");
  revalidatePath("/comercial/agenda");
  if (id) revalidatePath(`/comercial/cirurgias/${id}`);
}

export async function salvarCirurgia(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...EDITAM]);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  let savedId: string;
  try {
    if (id) {
      const atual = await db.cirurgia.findUnique({ where: { id }, include: { _count: { select: { consumos: true, remessas: true } } } });
      if (!atual) return { error: "Cirurgia não encontrada." };
      if (atual.status === "FATURADA" || atual.status === "CANCELADA") return { error: `Cirurgia ${atual.status.toLowerCase()} não pode ser editada.` };
      if (atual.hospitalId !== data.hospitalId && (atual._count.consumos > 0 || atual._count.remessas > 0)) {
        return { fieldErrors: { hospitalId: "Não é possível trocar o hospital: há remessas ou consumo vinculados." }, error: "Verifique os campos destacados." };
      }
      const saved = await db.cirurgia.update({ where: { id }, data });
      savedId = saved.id;
      await audit(user.id, "editar", "Cirurgia", saved.id, `CIR-${saved.numero}`);
    } else {
      const saved = await db.cirurgia.create({ data });
      savedId = saved.id;
      await audit(user.id, "criar", "Cirurgia", saved.id, `CIR-${saved.numero}`);
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(savedId);
  redirect(`/comercial/cirurgias/${savedId}`);
}

export async function confirmarCirurgia(id: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser([...EDITAM]);
  const c = await db.cirurgia.findUnique({ where: { id } });
  if (!c) return { error: "Cirurgia não encontrada." };
  if (c.status !== "AGENDADA") return { error: "Apenas cirurgias agendadas podem ser confirmadas." };
  await db.cirurgia.update({ where: { id }, data: { status: "CONFIRMADA" } });
  await audit(user.id, "confirmar", "Cirurgia", id, `CIR-${c.numero}`);
  revalidar(id);
  return { ok: true };
}

export async function cancelarCirurgia(id: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser([...EDITAM]);
  const c = await db.cirurgia.findUnique({ where: { id }, include: { _count: { select: { consumos: true } }, pedido: true } });
  if (!c) return { error: "Cirurgia não encontrada." };
  if (c.status === "FATURADA" || c.status === "CANCELADA") return { error: `Cirurgia já está ${c.status.toLowerCase()}.` };
  if (c._count.consumos > 0) return { error: "Há consumo registrado. Remova o consumo antes de cancelar." };
  if (c.pedido && c.pedido.status !== "CANCELADO") return { error: "Há pedido de venda vinculado." };
  await db.cirurgia.update({ where: { id }, data: { status: "CANCELADA" } });
  await audit(user.id, "cancelar", "Cirurgia", id, `CIR-${c.numero}`);
  revalidar(id);
  return { ok: true };
}

const consumoSchema = z.object({
  loteId: zf.text("Selecione o produto/lote"),
  quantidade: zf.int(1),
});

/** Consumo direto a partir do estoque consignado já existente no hospital. */
export async function registrarConsumo(cirurgiaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "ESTOQUE"]);
  const parsed = parseForm(consumoSchema, fd);
  if (!parsed.success) return parsed.state;
  const { loteId, quantidade } = parsed.data;
  try {
    await db.$transaction(async (tx) => {
      const c = await tx.cirurgia.findUnique({ where: { id: cirurgiaId } });
      if (!c) throw new ErroNegocio("Cirurgia não encontrada.");
      if (!["AGENDADA", "CONFIRMADA", "REALIZADA"].includes(c.status)) {
        throw new ErroNegocio(`Não é possível registrar consumo em cirurgia ${c.status.toLowerCase()}.`);
      }
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
        usuario: user.nome,
      });
      await tx.cirurgiaConsumo.create({ data: { cirurgiaId, produtoId: lote.produtoId, loteId: lote.id, quantidade } });
      if (c.status !== "REALIZADA") await tx.cirurgia.update({ where: { id: cirurgiaId }, data: { status: "REALIZADA" } });
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(user.id, "registrar consumo", "Cirurgia", cirurgiaId, `lote ${loteId} x${quantidade}`);
  revalidar(cirurgiaId);
  return { ok: true };
}

/** Remove uma linha de consumo, devolvendo a quantidade ao estoque consignado do hospital (estorno). */
export async function removerConsumo(consumoId: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "ESTOQUE"]);
  let cirurgiaId = "";
  try {
    await db.$transaction(async (tx) => {
      const consumo = await tx.cirurgiaConsumo.findUnique({ where: { id: consumoId }, include: { cirurgia: true, produto: true } });
      if (!consumo) throw new ErroNegocio("Consumo não encontrado.");
      const c = consumo.cirurgia;
      cirurgiaId = c.id;
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
        usuario: user.nome,
      });
      await tx.cirurgiaConsumo.delete({ where: { id: consumoId } });
      const restantes = await tx.cirurgiaConsumo.count({ where: { cirurgiaId: c.id } });
      if (restantes === 0 && c.status === "REALIZADA") {
        await tx.cirurgia.update({ where: { id: c.id }, data: { status: "CONFIRMADA" } });
      }
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(user.id, "estornar consumo", "Cirurgia", cirurgiaId, `consumo ${consumoId}`);
  revalidar(cirurgiaId);
  return { ok: true };
}

export async function faturar(cirurgiaId: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO"]);
  let pedidoId: number;
  try {
    const pedido = await db.$transaction((tx) => faturarCirurgia(tx, cirurgiaId));
    pedidoId = pedido.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(user.id, "faturar", "Cirurgia", cirurgiaId, `PV-${pedidoId}`);
  await audit(user.id, "criar", "PedidoVenda", pedidoId, `cirurgia ${cirurgiaId}`);
  revalidar(cirurgiaId);
  revalidatePath("/comercial/pedidos");
  redirect(`/comercial/pedidos/${pedidoId}`);
}
