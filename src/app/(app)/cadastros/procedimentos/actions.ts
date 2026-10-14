"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { deleteErrorMessage, PERFIS_COMERCIAL } from "../_lib/acoes";

const schema = z.object({
  codigoTuss: zf.optText(),
  descricao: zf.text(),
  especialidade: zf.optText(),
});

export async function salvarProcedimento(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: string | null = null;
  try {
    const saved = id
      ? await db.procedimento.update({ where: { id }, data: parsed.data })
      : await db.procedimento.create({ data: parsed.data });
    await audit(user.id, id ? "editar" : "criar", "Procedimento", saved.id, saved.descricao);
    if (!id) novoId = saved.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/procedimentos");
  // Novo procedimento: segue para a tela de edição, onde os materiais padrão são incluídos.
  if (novoId) redirect(`/cadastros/procedimentos/${novoId}`);
  return { ok: true };
}

const itemSchema = z.object({ produtoId: zf.text("Selecione o produto"), quantidade: zf.int(1) });

export async function adicionarItem(procedimentoId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const existente = await db.procedimentoItem.findFirst({ where: { procedimentoId, produtoId: parsed.data.produtoId } });
    if (existente) {
      await db.procedimentoItem.update({ where: { id: existente.id }, data: { quantidade: existente.quantidade + parsed.data.quantidade } });
    } else {
      await db.procedimentoItem.create({ data: { procedimentoId, ...parsed.data } });
    }
    await audit(user.id, "adicionar item", "Procedimento", procedimentoId, `${parsed.data.produtoId} x${parsed.data.quantidade}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/cadastros/procedimentos/${procedimentoId}`);
  return { ok: true };
}

export async function removerItem(itemId: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const item = await db.procedimentoItem.delete({ where: { id: itemId } });
    await audit(user.id, "remover item", "Procedimento", item.procedimentoId, item.produtoId);
    revalidatePath(`/cadastros/procedimentos/${item.procedimentoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function excluirProcedimento(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const n = await db.cirurgia.count({ where: { procedimentoId: id } });
    if (n > 0) return { error: `Não é possível excluir: ${n} cirurgia(s) vinculada(s).` };
    const p = await db.procedimento.delete({ where: { id } });
    await audit(user.id, "excluir", "Procedimento", id, p.descricao);
  } catch (e) {
    return { error: deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/procedimentos");
  redirect("/cadastros/procedimentos");
}
