"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
  const user = await requireUser(["COMERCIAL", "ESTOQUE", "QUALIDADE", "COMPRAS"]);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    const saved = id
      ? await db.produto.update({ where: { id }, data })
      : await db.produto.create({ data });
    await audit(user.id, id ? "editar" : "criar", "Produto", saved.id, saved.codigo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/produtos");
  return { ok: true };
}
