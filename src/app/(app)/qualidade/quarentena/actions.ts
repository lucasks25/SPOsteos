"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_QUALIDADE } from "../_lib/perfis";
import { inspecionarLoteServico } from "../_lib/inspecao-servico";

const schema = z.object({
  resultado: z.enum(["LIBERADO", "NAO_CONFORME", "BLOQUEADO"], { error: "Selecione o resultado" }),
  embalagemOk: zf.bool(),
  rotulagemOk: zf.bool(),
  documentacaoOk: zf.bool(),
  observacao: zf.optText(),
});

export async function inspecionarLote(loteId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_QUALIDADE);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;

  if (data.resultado === "LIBERADO" && (!data.embalagemOk || !data.rotulagemOk || !data.documentacaoOk)) {
    return { error: "Não é possível liberar um lote com itens do checklist reprovados." };
  }
  if (data.resultado !== "LIBERADO" && !data.observacao) {
    return { error: "Informe a observação/justificativa da não conformidade ou bloqueio.", fieldErrors: { observacao: "Obrigatório" } };
  }

  let movido = 0;
  try {
    const r = await db.$transaction((tx) => inspecionarLoteServico(tx, loteId, { ...data, inspetor: user.nome }));
    movido = r.movido;
    await audit(user.id, "inspecionar", "Lote", loteId, `${data.resultado}; ${movido} un. transferidas`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/qualidade/quarentena");
  revalidatePath("/qualidade/lotes");
  redirect("/qualidade/quarentena");
}
