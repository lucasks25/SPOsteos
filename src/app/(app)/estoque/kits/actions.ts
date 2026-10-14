"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_EDITAR } from "../_lib/perfis";

const schema = z.object({ codigo: zf.text(), descricao: zf.text() });

export async function salvarKit(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: string | null = null;
  try {
    const kit = id ? await db.kit.update({ where: { id }, data: parsed.data }) : await db.kit.create({ data: parsed.data });
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
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const ex = await db.kitItem.findFirst({ where: { kitId, produtoId: parsed.data.produtoId } });
    if (ex) await db.kitItem.update({ where: { id: ex.id }, data: { quantidade: ex.quantidade + parsed.data.quantidade } });
    else await db.kitItem.create({ data: { kitId, ...parsed.data } });
    await audit(user.id, "adicionar item", "Kit", kitId, `${parsed.data.produtoId} x${parsed.data.quantidade}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/estoque/kits/${kitId}`);
  return { ok: true };
}

export async function removerItemKit(itemId: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const it = await db.kitItem.delete({ where: { id: itemId } });
    await audit(user.id, "remover item", "Kit", it.kitId, it.produtoId);
    revalidatePath(`/estoque/kits/${it.kitId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function excluirKit(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const n = await db.remessa.count({ where: { kitId: id } });
    if (n > 0) return { error: `Não é possível excluir: usado em ${n} remessa(s).` };
    const k = await db.kit.delete({ where: { id } });
    await audit(user.id, "excluir", "Kit", id, k.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/estoque/kits");
  redirect("/estoque/kits");
}
