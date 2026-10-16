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
  // cada caixa marcada vem como "id:versão" (a versão do que a tela mostrou: valor, vencimento, fornecedor e boleto)
  const versoes: Record<string, string> = {};
  for (const v of fd.getAll("id")) {
    const m = typeof v === "string" ? /^([A-Za-z0-9_-]{1,64}):([0-9a-f]{16})$/.exec(v) : null;
    if (!m) return { error: "Seleção inválida: recarregue a página e tente de novo." };
    versoes[m[1]] = m[2];
  }
  const ids = Object.keys(versoes);
  try {
    const n = await db.$transaction((tx) => aprovarContasPagarTx(tx, ids, user.id, versoes));
    await audit(user.id, "aprovar contas a pagar", "ContaPagar", undefined, `${n} conta(s): ${ids.slice(0, 10).join(", ")}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/aprovacoes", "/financeiro/pagar", "/financeiro/remessas", "/"]) revalidatePath(p);
  return { ok: true };
}
