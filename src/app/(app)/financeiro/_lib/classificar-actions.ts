"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { classificarEmLote, lerItens } from "./classificar";

/** Lote grande (centenas de itens) com banco remoto passa dos 5 s do padrão do Prisma; vale por cima do padrão global. */
const TX_OPTS = { timeout: 60_000, maxWait: 10_000 };

/** Classifica vários itens de uma vez (títulos e lançamentos avulsos sem conta do plano). */
export async function classificarLote(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const planoContaId = String(fd.get("planoContaId") ?? "");
  const centroCustoId = String(fd.get("centroCustoId") ?? "") || null;
  if (!planoContaId) return { fieldErrors: { planoContaId: "Escolha a conta do plano" }, error: "Verifique os campos destacados." };
  try {
    const n = await db.$transaction((tx) => classificarEmLote(tx, lerItens(fd.getAll("item")), planoContaId, centroCustoId), TX_OPTS);
    await audit(user.id, "classificar em lote", "PlanoConta", planoContaId, `${n} item(ns)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/classificar", "/financeiro/dre", "/financeiro/receber", "/financeiro/pagar", "/financeiro/plano-contas"]) revalidatePath(p);
  return { ok: true };
}
