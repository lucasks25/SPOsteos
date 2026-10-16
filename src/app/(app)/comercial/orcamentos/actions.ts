"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { mudarStatusOrcamentoTx, type StatusOrcamento } from "../_lib/orcamento-servico";
import { precosDoHospital } from "../_lib/precos";

const PERFIS = ["COMERCIAL"] as const;

const schema = z.object({
  hospitalId: zf.text("Selecione o hospital"),
  convenioId: zf.optText(),
  paciente: zf.optText(),
  validade: zf.optDate(),
  observacao: zf.optText(),
});

async function editavel(id: number) {
  const o = await db.orcamento.findUniqueOrThrow({ where: { id } });
  if (o.status !== "RASCUNHO") throw new ErroNegocio("Só é possível alterar orçamentos em rascunho.");
  return o;
}

export async function salvarOrcamento(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: number | null = null;
  try {
    if (id) {
      await editavel(id);
      await db.orcamento.update({ where: { id }, data: parsed.data });
    } else {
      const o = await db.orcamento.create({ data: parsed.data });
      novoId = o.id;
    }
    await audit(user.id, id ? "editar" : "criar", "Orcamento", id ?? novoId ?? undefined);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/comercial/orcamentos");
  if (novoId) redirect(`/comercial/orcamentos/${novoId}`);
  revalidatePath(`/comercial/orcamentos/${id}`);
  return { ok: true };
}

const itemSchema = z.object({ produtoId: zf.text("Selecione o produto"), quantidade: zf.int(1), preco: zf.optMoney() });

export async function adicionarItemOrcamento(orcamentoId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const o = await editavel(orcamentoId);
    const { produtoId, quantidade } = parsed.data;
    const precoUnit = parsed.data.preco ?? (await precosDoHospital(db, o.hospitalId, [produtoId])).get(produtoId)?.preco ?? 0;
    await db.orcamentoItem.create({ data: { orcamentoId, produtoId, quantidade, precoUnit } });
    await audit(user.id, "adicionar item", "Orcamento", orcamentoId, `${produtoId} x${quantidade} @ ${precoUnit}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/comercial/orcamentos/${orcamentoId}`);
  return { ok: true };
}

export async function removerItemOrcamento(itemId: string): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    const it = await db.orcamentoItem.findUniqueOrThrow({ where: { id: itemId } });
    await editavel(it.orcamentoId);
    await db.orcamentoItem.delete({ where: { id: itemId } });
    await audit(user.id, "remover item", "Orcamento", it.orcamentoId, it.produtoId);
    revalidatePath(`/comercial/orcamentos/${it.orcamentoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function mudarStatusOrcamento(id: number, status: StatusOrcamento): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    await db.$transaction((tx) => mudarStatusOrcamentoTx(tx, id, status));
    await audit(user.id, `status ${status}`, "Orcamento", id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/comercial/orcamentos");
  revalidatePath(`/comercial/orcamentos/${id}`);
  return { ok: true };
}
