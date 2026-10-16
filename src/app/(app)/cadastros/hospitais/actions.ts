"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { localDoHospital, removerLocalDoHospital } from "@/lib/estoque";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj, UFS } from "@/lib/documentos-br";
import { deleteErrorMessage, PERFIS_HOSPITAL } from "../_lib/acoes";

const schema = z.object({
  razaoSocial: zf.text(),
  nomeFantasia: zf.optText(),
  cnpj: zf.text("CNPJ obrigatório"),
  ie: zf.optText(),
  email: z.email("E-mail inválido").optional().transform((v) => v ?? null),
  telefone: zf.optText(),
  endereco: zf.optText(),
  bairro: zf.optText(),
  cep: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || v.length === 8, "CEP com 8 dígitos"),
  cidade: zf.optText(),
  uf: z.enum(UFS, { error: "UF inválida" }).optional().transform((v) => v ?? null),
  prazoPagamentoDias: zf.int(0).max(365, "Máximo 365 dias"),
  tabelaPrecoId: zf.optText(),
  ativo: zf.bool(),
});

export async function salvarHospital(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_HOSPITAL);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    const atual = id ? await db.hospital.findUnique({ where: { id } }) : null;
    if (id && !atual) return { error: "Hospital não encontrado." };
    const c = checarCnpj(data.cnpj, atual?.cnpj);
    if (!c.ok) return { error: "Verifique os campos destacados.", fieldErrors: { cnpj: c.error } };
    data.cnpj = c.value;
    const saved = await db.$transaction(async (tx) => {
      const h = id ? await tx.hospital.update({ where: { id }, data }) : await tx.hospital.create({ data });
      // Garante o local de estoque consignado do hospital (idempotente).
      await localDoHospital(tx, h.id);
      return h;
    });
    const detalhe = atual && atual.ativo !== saved.ativo ? ` (${saved.ativo ? "ativado" : "inativado"})` : "";
    await audit(user.id, id ? "editar" : "criar", "Hospital", saved.id, `${saved.razaoSocial}${detalhe}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/hospitais");
  if (id) revalidatePath(`/cadastros/hospitais/${id}`);
  return { ok: true };
}

export async function alternarAtivoHospital(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_HOSPITAL);
  id = argId(id);
  try {
    const h = await db.hospital.findUniqueOrThrow({ where: { id } });
    await db.hospital.update({ where: { id }, data: { ativo: !h.ativo } });
    await audit(user.id, h.ativo ? "inativar" : "ativar", "Hospital", id, h.razaoSocial);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/hospitais");
  revalidatePath(`/cadastros/hospitais/${id}`);
  return { ok: true };
}

/** Exclusão física só quando não há nenhum movimento/documento vinculado. */
export async function excluirHospital(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_HOSPITAL);
  id = argId(id);
  try {
    const h = await db.hospital.findUniqueOrThrow({
      where: { id },
      include: { local: { include: { _count: { select: { saldos: true, movOrigem: true, movDestino: true, remessas: true } } } } },
    });
    const loc = h.local?._count;
    if (loc && loc.saldos + loc.movOrigem + loc.movDestino + loc.remessas > 0) {
      return { error: "Não é possível excluir: o local consignado do hospital possui movimentação. Inative-o." };
    }
    await db.$transaction(async (tx) => {
      if (h.local && !(await removerLocalDoHospital(tx, h.local.id))) throw new ErroNegocio("Não é possível excluir: o local consignado do hospital possui movimentação. Inative-o.");
      await tx.hospital.delete({ where: { id } });
    });
    await audit(user.id, "excluir", "Hospital", id, h.razaoSocial);
  } catch (e) {
    return { error: e instanceof ErroNegocio ? e.message : deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/hospitais");
  redirect("/cadastros/hospitais");
}
