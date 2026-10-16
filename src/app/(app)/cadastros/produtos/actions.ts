"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../_lib/acoes";
import { podeAlterarPreco } from "../_lib/permissoes";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";

const schema = z.object({
  codigo: zf.text(),
  descricao: zf.text(),
  referencia: zf.optText(),
  fabricanteId: zf.optText(),
  registroAnvisa: zf.optText(),
  validadeRegistro: zf.optDate(),
  classeRisco: zf.optText(),
  gtin: zf.optText(),
  ncm: zf.optText(),
  unidade: zf.text(),
  precoBase: zf.money(),
  estoqueMinimo: zf.int(),
  controlaLote: zf.bool(),
  ativo: zf.bool(),
});

export async function salvarProduto(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_PRODUTO);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data: Record<string, unknown> & typeof parsed.data = parsed.data;
  // preço base só pelo comercial/admin: os demais perfis não alteram (no produto novo, começa em zero)
  if (!podeAlterarPreco(user.perfil)) {
    if (id) delete (data as Record<string, unknown>).precoBase;
    else data.precoBase = 0;
  }
  try {
    const saved = id
      ? await db.produto.update({ where: { id }, data: data as typeof parsed.data })
      : await db.produto.create({ data: data as typeof parsed.data });
    await audit(user.id, id ? "editar" : "criar", "Produto", saved.id, saved.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/produtos");
  return { ok: true };
}
