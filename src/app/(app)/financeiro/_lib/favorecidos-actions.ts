"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { argId } from "@/lib/auth-args";
import { errorMessage, parseForm, type ActionState } from "@/lib/forms";
import { schemaDadosPagamento } from "./favorecidos";
import { aprovarDadosPagamento, gravarDadosPagamento } from "./favorecidos-servico";

export async function salvarDadosPagamento(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  id = argId(id);
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

/** Aprova os dados de pagamento do favorecido (outra pessoa, não quem alterou). `hash` = dados que a tela mostrou. */
export async function aprovarDadosPagamentoAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  id = argId(id);
  const hash = fd.get("hash");
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return { error: "Recarregue a página e tente de novo." };
  try {
    await aprovarDadosPagamento(user, id, hash);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/favorecidos", `/financeiro/favorecidos/${id}`, "/financeiro/remessas", "/financeiro/aprovacoes"]) revalidatePath(p);
  return { ok: true };
}
