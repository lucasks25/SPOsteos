"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { fecharMesTx, reabrirMesTx } from "./fechamento-servico";

function revalidar() {
  for (const p of ["/financeiro/fechamento", "/financeiro/dre"]) revalidatePath(p);
}

/** Fecha um mês já encerrado e sem lançamentos sem conta do plano. */
export async function fecharMes(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const mes = String(fd.get("mes") ?? "");
  try {
    await fecharMesTx(db, mes, user.id);
    await audit(user.id, "fechar mês", "FechamentoMes", mes);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Reabre um mês fechado. Exige motivo; fica na auditoria. */
export async function reabrirMes(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const mes = String(fd.get("mes") ?? "");
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (motivo.length < 5) return { fieldErrors: { motivo: "Explique o motivo (mínimo 5 letras)" }, error: "Verifique os campos destacados." };
  try {
    await reabrirMesTx(db, mes);
    await audit(user.id, "reabrir mês", "FechamentoMes", mes, motivo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
