"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_QUALIDADE } from "../_lib/perfis";

/** Marca como VENCIDO todos os lotes liberados com validade anterior a hoje. */
export async function marcarVencidos(_: ActionState): Promise<ActionState> {
  const user = await requireUser(PERFIS_QUALIDADE);
  try {
    const hoje = hojeUTC();
    const alvo = await db.lote.findMany({ where: { status: "LIBERADO", validade: { lt: hoje } }, select: { id: true, numero: true } });
    if (alvo.length === 0) return { error: "Nenhum lote liberado vencido encontrado." };
    await db.lote.updateMany({ where: { id: { in: alvo.map((l) => l.id) }, status: "LIBERADO" }, data: { status: "VENCIDO" } });
    await audit(user.id, "marcar_vencidos", "Lote", undefined, `${alvo.length} lote(s): ${alvo.map((l) => l.numero).join(", ").slice(0, 900)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/qualidade/lotes");
  return { ok: true };
}
