"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { UFS } from "@/lib/documentos-br";
import { deleteErrorMessage, PERFIS_COMERCIAL } from "../_lib/acoes";

const schema = z.object({
  nome: zf.text(),
  crm: zf.text("CRM obrigatório").transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(3, "CRM inválido").max(10, "CRM inválido")),
  ufCrm: z.enum(UFS, { error: "UF do CRM obrigatória" }),
  especialidade: zf.optText(),
  email: z.email("E-mail inválido").optional().transform((v) => v ?? null),
  telefone: zf.optText(),
  ativo: zf.bool(),
});

export async function salvarMedico(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    const dup = await db.medico.findUnique({ where: { crm_ufCrm: { crm: data.crm, ufCrm: data.ufCrm } } });
    if (dup && dup.id !== id) {
      return { error: "Verifique os campos destacados.", fieldErrors: { crm: `CRM já cadastrado para ${dup.nome}.` } };
    }
    const saved = id ? await db.medico.update({ where: { id }, data }) : await db.medico.create({ data });
    await audit(user.id, id ? "editar" : "criar", "Medico", saved.id, `${saved.nome} CRM ${saved.crm}/${saved.ufCrm}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/medicos");
  return { ok: true };
}

export async function alternarAtivoMedico(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const m = await db.medico.findUniqueOrThrow({ where: { id } });
    await db.medico.update({ where: { id }, data: { ativo: !m.ativo } });
    await audit(user.id, m.ativo ? "inativar" : "ativar", "Medico", id, m.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/medicos");
  revalidatePath(`/cadastros/medicos/${id}`);
  return { ok: true };
}

export async function excluirMedico(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  try {
    const n = await db.cirurgia.count({ where: { medicoId: id } });
    if (n > 0) return { error: `Não é possível excluir: ${n} cirurgia(s) vinculada(s). Inative-o.` };
    const m = await db.medico.delete({ where: { id } });
    await audit(user.id, "excluir", "Medico", id, m.nome);
  } catch (e) {
    return { error: deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/medicos");
  redirect("/cadastros/medicos");
}
