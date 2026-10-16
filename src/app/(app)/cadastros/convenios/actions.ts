"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj } from "../_lib/documentos";
import { deleteErrorMessage, PERFIS_COMERCIAL } from "../_lib/acoes";

const schema = z.object({
  nome: zf.text(),
  registroAns: z
    .string()
    .regex(/^\d{6}$/, "Registro ANS deve ter 6 dígitos")
    .optional()
    .transform((v) => v ?? null),
  cnpj: zf.optText(),
  ativo: zf.bool(),
  exigeAutorizacao: zf.bool(),
});

export async function salvarConvenio(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    const atual = id ? await db.convenio.findUnique({ where: { id } }) : null;
    if (id && !atual) return { error: "Convênio não encontrado." };
    if (data.cnpj) {
      const c = checarCnpj(data.cnpj, atual?.cnpj);
      if (!c.ok) return { error: "Verifique os campos destacados.", fieldErrors: { cnpj: c.error } };
      data.cnpj = c.value;
    }
    const saved = id ? await db.convenio.update({ where: { id }, data }) : await db.convenio.create({ data });
    await audit(user.id, id ? "editar" : "criar", "Convenio", saved.id, saved.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/convenios");
  return { ok: true };
}

export async function alternarAtivoConvenio(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const c = await db.convenio.findUniqueOrThrow({ where: { id } });
    await db.convenio.update({ where: { id }, data: { ativo: !c.ativo } });
    await audit(user.id, c.ativo ? "inativar" : "ativar", "Convenio", id, c.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/convenios");
  revalidatePath(`/cadastros/convenios/${id}`);
  return { ok: true };
}

export async function excluirConvenio(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const [cir, orc] = await Promise.all([
      db.cirurgia.count({ where: { convenioId: id } }),
      db.orcamento.count({ where: { convenioId: id } }),
    ]);
    if (cir + orc > 0) return { error: "Não é possível excluir: há cirurgias ou orçamentos vinculados. Inative-o." };
    const c = await db.convenio.delete({ where: { id } });
    await audit(user.id, "excluir", "Convenio", id, c.nome);
  } catch (e) {
    return { error: deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/convenios");
  redirect("/cadastros/convenios");
}
