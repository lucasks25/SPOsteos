"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { parseDataHoraSP } from "@/lib/datas";
import { faturarCirurgia } from "../_lib/faturamento";
import { HospitalTravadoError, cancelarCirurgiaTx, confirmarCirurgiaTx, salvarCirurgiaTx } from "../_lib/cirurgia-servico";
import { registrarConsumoDiretoTx, removerConsumoTx } from "../_lib/consumo-servico";

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
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let savedId: string;
  try {
    const { cirurgia, criada } = await db.$transaction((tx) => salvarCirurgiaTx(tx, id, parsed.data));
    savedId = cirurgia.id;
    await audit(user.id, criada ? "criar" : "editar", "Cirurgia", cirurgia.id, `CIR-${cirurgia.numero}`);
  } catch (e) {
    if (e instanceof HospitalTravadoError) return { fieldErrors: { hospitalId: e.message }, error: "Verifique os campos destacados." };
    return { error: errorMessage(e) };
  }
  revalidar(savedId);
  redirect(`/comercial/cirurgias/${savedId}`);
}

export async function confirmarCirurgia(id: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser([...EDITAM]);
  id = argId(id);
  try {
    const c = await db.$transaction((tx) => confirmarCirurgiaTx(tx, id));
    await audit(user.id, "confirmar", "Cirurgia", id, `CIR-${c.numero}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function cancelarCirurgia(id: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser([...EDITAM]);
  id = argId(id);
  try {
    const c = await db.$transaction((tx) => cancelarCirurgiaTx(tx, id));
    await audit(user.id, "cancelar", "Cirurgia", id, `CIR-${c.numero}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
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
  cirurgiaId = argId(cirurgiaId);
  const parsed = parseForm(consumoSchema, fd);
  if (!parsed.success) return parsed.state;
  const { loteId, quantidade } = parsed.data;
  try {
    await db.$transaction((tx) => registrarConsumoDiretoTx(tx, { cirurgiaId, loteId, quantidade, usuario: user.nome }));
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
  consumoId = argId(consumoId);
  let cirurgiaId = "";
  try {
    cirurgiaId = await db.$transaction((tx) => removerConsumoTx(tx, consumoId, user.nome));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(user.id, "estornar consumo", "Cirurgia", cirurgiaId, `consumo ${consumoId}`);
  revalidar(cirurgiaId);
  return { ok: true };
}

export async function faturar(cirurgiaId: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO"]);
  cirurgiaId = argId(cirurgiaId);
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
