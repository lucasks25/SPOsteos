"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { date } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_QUALIDADE } from "../_lib/perfis";
import { ErroNegocio } from "@/lib/erros";
import { recolhimentoAtivoDoLote } from "../_lib/recolhimento-servico";
import { docRecolhimento } from "../_lib/recolhimento";

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
    await db.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({ where: { id: loteId }, include: { produto: true } });
      if (!lote) throw new ErroNegocio("Lote não encontrado.");
      const rec = await recolhimentoAtivoDoLote(tx, loteId);
      if (rec) throw new ErroNegocio(`Lote em recolhimento (${docRecolhimento(rec)}): não pode ser inspecionado nem liberado até o recolhimento terminar.`);
      const hoje = hojeUTC();
      if (data.resultado === "LIBERADO") {
        if (lote.validade < hoje) throw new ErroNegocio(`Lote vencido em ${date(lote.validade)} — não pode ser liberado.`);
        if (lote.produto.validadeRegistro && lote.produto.validadeRegistro < hoje) {
          throw new ErroNegocio(`Registro ANVISA do produto vencido em ${date(lote.produto.validadeRegistro)} — não pode ser liberado.`);
        }
      }
      const saldo = await tx.saldo.findUnique({ where: { loteId_localId: { loteId, localId: LOCAIS.QUARENTENA } } });
      const insp = await tx.inspecao.create({
        data: {
          loteId,
          resultado: data.resultado,
          embalagemOk: data.embalagemOk,
          rotulagemOk: data.rotulagemOk,
          documentacaoOk: data.documentacaoOk,
          observacao: data.observacao,
          inspetor: user.nome,
        },
      });
      await tx.lote.update({ where: { id: loteId }, data: { status: data.resultado } });
      movido = saldo?.quantidade ?? 0;
      if (movido > 0) {
        await movimentar(tx, {
          tipo: "TRANSFERENCIA",
          produtoId: lote.produtoId,
          loteId,
          quantidade: movido,
          origemId: LOCAIS.QUARENTENA,
          destinoId: data.resultado === "LIBERADO" ? LOCAIS.DEPOSITO : LOCAIS.NAO_CONFORME,
          custoUnit: Number(lote.produto.custoMedio.toString()),
          documento: `INSP-${insp.id}`,
          observacao: `Inspeção de recebimento: ${data.resultado}`,
          usuario: user.nome,
        });
      }
    });
    await audit(user.id, "inspecionar", "Lote", loteId, `${data.resultado}; ${movido} un. transferidas`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/qualidade/quarentena");
  revalidatePath("/qualidade/lotes");
  redirect("/qualidade/quarentena");
}
