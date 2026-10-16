"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { aprovarContasPagarTx } from "./aprovacao-servico";

/**
 * Aprova contas a pagar vindas de recebimento de compra para poderem entrar em remessa SISPAG.
 * Separação de funções: quem recebe a compra (compras/estoque) não aprova o pagamento.
 */
export async function aprovarContasPagar(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const ids = [...new Set(fd.getAll("id").filter((v): v is string => typeof v === "string" && v.length > 0))];
  try {
    const n = await db.$transaction((tx) => aprovarContasPagarTx(tx, ids, user.id));
    await audit(user.id, "aprovar contas a pagar", "ContaPagar", undefined, `${n} conta(s): ${ids.slice(0, 10).join(", ")}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/aprovacoes", "/financeiro/pagar", "/financeiro/remessas", "/"]) revalidatePath(p);
  return { ok: true };
}
