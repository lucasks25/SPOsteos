"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_EDITAR } from "../_lib/perfis";
import * as servico from "../_lib/kits-servico";

const schema = z.object({ codigo: zf.text(), descricao: zf.text() });

export async function salvarKit(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: string | null = null;
  try {
    const kit = await db.$transaction((tx) => (id ? servico.editarKit(tx, id, parsed.data) : servico.criarKit(tx, parsed.data)));
    await audit(user.id, id ? "editar" : "criar", "Kit", kit.id, kit.codigo);
    if (!id) novoId = kit.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/estoque/kits");
  if (novoId) redirect(`/estoque/kits/${novoId}`);
  return { ok: true };
}

const itemSchema = z.object({ produtoId: zf.text("Selecione o produto"), quantidade: zf.int(1) });

export async function adicionarItemKit(kitId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  kitId = argId(kitId);
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction((tx) => servico.adicionarItemKit(tx, kitId, parsed.data));
    await audit(user.id, "adicionar item", "Kit", kitId, `${parsed.data.produtoId} x${parsed.data.quantidade}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/estoque/kits/${kitId}`);
  return { ok: true };
}

export async function removerItemKit(itemId: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  itemId = argId(itemId);
  try {
    const it = await db.$transaction((tx) => servico.removerItemKit(tx, itemId));
    await audit(user.id, "remover item", "Kit", it.kitId, it.produtoId);
    revalidatePath(`/estoque/kits/${it.kitId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function excluirKit(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  id = argId(id);
  try {
    const k = await db.$transaction((tx) => servico.excluirKit(tx, id));
    await audit(user.id, "excluir", "Kit", id, k.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/estoque/kits");
  redirect("/estoque/kits");
}
