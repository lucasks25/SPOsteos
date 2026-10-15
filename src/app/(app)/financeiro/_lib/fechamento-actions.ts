"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { addMeses, hojeUTC, inicioMes } from "./datas";
import { carregarLinhasDre } from "./dre-dados";
import { rotuloMes } from "./fechamento";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function revalidar() {
  for (const p of ["/financeiro/fechamento", "/financeiro/dre"]) revalidatePath(p);
}

/** Fecha um mês já encerrado e sem lançamentos sem conta do plano. */
export async function fecharMes(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const mes = String(fd.get("mes") ?? "");
  try {
    if (!MES.test(mes)) throw new ErroNegocio("Mês inválido.");
    const ini = new Date(`${mes}-01T00:00:00Z`);
    if (ini >= inicioMes(hojeUTC())) throw new ErroNegocio("Só é possível fechar meses que já terminaram.");
    if (await db.fechamentoMes.findUnique({ where: { mes } })) throw new ErroNegocio("Este mês já está fechado.");
    const linhas = await carregarLinhasDre(ini, addMeses(ini, 1), null);
    const sem = linhas.filter((l) => l.tipo === null).length;
    if (sem > 0) throw new ErroNegocio(`Há ${sem} lançamento(s) sem conta do plano em ${rotuloMes(mes)}. Classifique-os antes de fechar (veja o DRE, linha "Não classificado").`);
    await db.fechamentoMes.create({ data: { mes, usuarioId: user.id } });
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
    const r = await db.fechamentoMes.deleteMany({ where: { mes } });
    if (r.count === 0) throw new ErroNegocio("Este mês não está fechado.");
    await audit(user.id, "reabrir mês", "FechamentoMes", mes, motivo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
