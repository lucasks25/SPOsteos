"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { isCnpj, isCpf, onlyDigits } from "../_lib/documentos";
import { PERFIS_COMERCIAL } from "../_lib/acoes";

const schema = z.object({
  nome: zf.text(),
  cpfCnpj: zf.optText().refine((v) => !v || isCpf(v) || isCnpj(v), "CPF/CNPJ inválido").transform((v) => (v ? onlyDigits(v) : null)),
  email: z.email("E-mail inválido").optional().transform((v) => v ?? null),
  telefone: zf.optText(),
  comissaoPercent: z.coerce.number({ error: "Valor inválido" }).min(0, "Mínimo 0").max(100, "Máximo 100"),
  ativo: zf.bool(),
});

export async function salvarRepresentante(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMERCIAL);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const saved = id
      ? await db.representante.update({ where: { id }, data: parsed.data })
      : await db.representante.create({ data: parsed.data });
    await audit(user.id, id ? "editar" : "criar", "Representante", saved.id, `${saved.nome} (${saved.comissaoPercent}%)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/cadastros/representantes");
  return { ok: true };
}
