"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_EDITAR } from "../_lib/perfis";

const schema = z
  .object({
    operacao: z.enum(["ENTRADA", "SAIDA", "PERDA"], { error: "Selecione a operação" }),
    localId: zf.text("Selecione o local"),
    loteId: zf.text("Selecione o lote"),
    quantidade: zf.int(1),
    observacao: zf.optText(),
  })
  .refine((d) => d.operacao !== "PERDA" || (d.observacao?.length ?? 0) >= 5, { path: ["observacao"], message: "Informe o motivo da perda" });

export async function registrarAjuste(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const d = parsed.data;
  try {
    const lote = await db.lote.findUniqueOrThrow({ where: { id: d.loteId }, include: { produto: true } });
    const entrada = d.operacao === "ENTRADA";
    const mov = await db.$transaction((tx) =>
      movimentar(tx, {
        tipo: d.operacao === "PERDA" ? "PERDA" : "AJUSTE",
        produtoId: lote.produtoId,
        loteId: lote.id,
        quantidade: d.quantidade,
        origemId: entrada ? null : d.localId,
        destinoId: entrada ? d.localId : null,
        custoUnit: toNumber(lote.produto.custoMedio),
        documento: d.operacao === "PERDA" ? "PERDA" : entrada ? "AJUSTE+" : "AJUSTE-",
        observacao: d.observacao ?? undefined,
        usuario: user.nome,
      }),
    );
    await audit(user.id, d.operacao.toLowerCase(), "Movimento", mov.id, `${lote.produto.codigo} lote ${lote.numero} qtd ${d.quantidade} — ${d.observacao ?? ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/estoque/ajustes");
  revalidatePath("/estoque/saldos");
  return { ok: true };
}
