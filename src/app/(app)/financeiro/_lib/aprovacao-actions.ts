"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { garantirMesAberto } from "./fechamento";

/**
 * Aprova contas a pagar vindas de recebimento de compra para poderem entrar em remessa SISPAG.
 * Separação de funções: quem recebe a compra (compras/estoque) não aprova o pagamento.
 */
export async function aprovarContasPagar(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const ids = [...new Set(fd.getAll("id").filter((v): v is string => typeof v === "string" && v.length > 0))];
  try {
    if (ids.length === 0) throw new ErroNegocio("Selecione ao menos uma conta.");
    if (ids.length > 500) throw new ErroNegocio("Máximo de 500 por vez.");
    const n = await db.$transaction(async (tx) => {
      const contas = await tx.contaPagar.findMany({ where: { id: { in: ids }, aprovadoEm: null, status: "ABERTO" }, select: { id: true, competencia: true } });
      await garantirMesAberto(tx, contas.map((c) => c.competencia), "aprovar contas dessa competência");
      const r = await tx.contaPagar.updateMany({ where: { id: { in: contas.map((c) => c.id) }, aprovadoEm: null }, data: { aprovadoEm: new Date(), aprovadoPor: user.id } });
      return r.count;
    });
    if (n === 0) throw new ErroNegocio("Nada a aprovar: as contas já foram aprovadas, pagas ou canceladas.");
    await audit(user.id, "aprovar contas a pagar", "ContaPagar", undefined, `${n} conta(s): ${ids.slice(0, 10).join(", ")}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/aprovacoes", "/financeiro/pagar", "/financeiro/remessas", "/"]) revalidatePath(p);
  return { ok: true };
}
