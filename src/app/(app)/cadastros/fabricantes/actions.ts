"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj } from "@/lib/documentos-br";
import { deleteErrorMessage, PERFIS_SUPRIMENTOS } from "../_lib/acoes";

const schema = z.object({
  nome: zf.text(),
  cnpj: zf.optText(),
  pais: zf.optText(),
});

export async function salvarFabricante(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_SUPRIMENTOS);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    const atual = id ? await db.fabricante.findUnique({ where: { id } }) : null;
    if (id && !atual) return { error: "Fabricante não encontrado." };
    // CNPJ é opcional (fabricantes estrangeiros não têm); se informado, valida.
    if (data.cnpj) {
      const c = checarCnpj(data.cnpj, atual?.cnpj);
      if (!c.ok) return { error: "Verifique os campos destacados.", fieldErrors: { cnpj: c.error } };
      data.cnpj = c.value;
    }
    const saved = id ? await db.fabricante.update({ where: { id }, data }) : await db.fabricante.create({ data });
    await audit(user.id, id ? "editar" : "criar", "Fabricante", saved.id, saved.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/fabricantes");
  return { ok: true };
}

export async function excluirFabricante(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_SUPRIMENTOS);
  id = argId(id);
  try {
    const n = await db.produto.count({ where: { fabricanteId: id } });
    if (n > 0) return { error: `Não é possível excluir: ${n} produto(s) vinculado(s).` };
    const f = await db.fabricante.delete({ where: { id } });
    await audit(user.id, "excluir", "Fabricante", id, f.nome);
  } catch (e) {
    return { error: deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/fabricantes");
  redirect("/cadastros/fabricantes");
}
