"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { errorMessage, parseForm, type ActionState } from "@/lib/forms";
import { schemaDadosPagamento } from "./favorecidos";
import { gravarDadosPagamento } from "./favorecidos-servico";

export async function salvarDadosPagamento(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaDadosPagamento, fd);
  if (!parsed.success) return parsed.state;
  try {
    await gravarDadosPagamento(user, id, parsed.data);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/favorecidos", `/financeiro/favorecidos/${id}`, "/financeiro/remessas"]) revalidatePath(p);
  return { ok: true };
}
