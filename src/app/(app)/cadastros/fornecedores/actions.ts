"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj, UFS } from "@/lib/documentos-br";
import { deleteErrorMessage, PERFIS_FORNECEDOR } from "../_lib/acoes";

const schema = z.object({
  razaoSocial: zf.text(),
  nomeFantasia: zf.optText(),
  cnpj: zf.text("CNPJ obrigatório"),
  ie: zf.optText(),
  email: z.email("E-mail inválido").optional().transform((v) => v ?? null),
  telefone: zf.optText(),
  cidade: zf.optText(),
  uf: z.enum(UFS, { error: "UF inválida" }).optional().transform((v) => v ?? null),
  afe: zf.optText(),
  ativo: zf.bool(),
});

export async function salvarFornecedor(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_FORNECEDOR);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  // dados bancários/Pix não passam por aqui: a escrita nessas colunas é só do financeiro (financeiro/_lib/favorecidos-servico.ts)
  const data = { ...parsed.data };
  try {
    const atual = id ? await db.fornecedor.findUnique({ where: { id } }) : null;
    if (id && !atual) return { error: "Fornecedor não encontrado." };
    const c = checarCnpj(data.cnpj, atual?.cnpj);
    if (!c.ok) return { error: "Verifique os campos destacados.", fieldErrors: { cnpj: c.error } };
    data.cnpj = c.value;
    const saved = id ? await db.fornecedor.update({ where: { id }, data }) : await db.fornecedor.create({ data });
    const detalhe = atual && atual.ativo !== saved.ativo ? ` (${saved.ativo ? "ativado" : "inativado"})` : "";
    await audit(user.id, id ? "editar" : "criar", "Fornecedor", saved.id, `${saved.razaoSocial}${detalhe}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/fornecedores");
  return { ok: true };
}

export async function alternarAtivoFornecedor(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_FORNECEDOR);
  id = argId(id);
  try {
    const f = await db.fornecedor.findUniqueOrThrow({ where: { id } });
    await db.fornecedor.update({ where: { id }, data: { ativo: !f.ativo } });
    await audit(user.id, f.ativo ? "inativar" : "ativar", "Fornecedor", id, f.razaoSocial);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/fornecedores");
  revalidatePath(`/cadastros/fornecedores/${id}`);
  return { ok: true };
}

export async function excluirFornecedor(id: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_FORNECEDOR);
  id = argId(id);
  try {
    const [pedidos, contas] = await Promise.all([
      db.pedidoCompra.count({ where: { fornecedorId: id } }),
      db.contaPagar.count({ where: { fornecedorId: id } }),
    ]);
    if (pedidos + contas > 0) return { error: "Não é possível excluir: há pedidos de compra ou contas a pagar vinculados. Inative-o." };
    const f = await db.fornecedor.delete({ where: { id } });
    await audit(user.id, "excluir", "Fornecedor", id, f.razaoSocial);
  } catch (e) {
    return { error: deleteErrorMessage(e) };
  }
  revalidatePath("/cadastros/fornecedores");
  redirect("/cadastros/fornecedores");
}
