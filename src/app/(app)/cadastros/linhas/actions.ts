"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_PRODUTO } from "../_lib/acoes";
import { alternarAtivoLinhaTx, excluirLinhaTx, salvarLinhaTx } from "../_lib/linhas-servico";

const schema = z.object({
  codigo: zf.text().max(20, "Máximo 20 caracteres"),
  nome: zf.text().max(120, "Máximo 120 caracteres"),
  grupo: zf.text().max(60, "Máximo 60 caracteres"),
  ordem: zf.int(0, 9999),
  ativo: zf.bool(),
});

function revalidar(id?: string) {
  revalidatePath("/cadastros/linhas");
  if (id) revalidatePath(`/cadastros/linhas/${id}`);
}

export async function salvarLinha(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_PRODUTO);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const saved = await db.$transaction((tx) => salvarLinhaTx(tx, id, parsed.data));
    await audit(user.id, id ? "editar" : "criar", "LinhaProduto", saved.id, saved.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

export async function alternarAtivoLinha(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_PRODUTO);
  id = argId(id);
  try {
    const l = await db.$transaction((tx) => alternarAtivoLinhaTx(tx, id));
    await audit(user.id, l.ativo ? "ativar" : "inativar", "LinhaProduto", id, l.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function excluirLinha(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_PRODUTO);
  id = argId(id);
  try {
    const l = await db.$transaction((tx) => excluirLinhaTx(tx, id));
    await audit(user.id, "excluir", "LinhaProduto", id, l.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  redirect("/cadastros/linhas");
}
