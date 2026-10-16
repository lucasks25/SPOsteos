"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argEnum, argId, argInt, argIntOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { exigirOrcamentoEditavelTx, mudarStatusOrcamentoTx, type StatusOrcamento } from "../_lib/orcamento-servico";
import { precosDoHospital } from "../_lib/precos";

const PERFIS = ["COMERCIAL"] as const;

const schema = z.object({
  hospitalId: zf.text("Selecione o hospital"),
  convenioId: zf.optText(),
  paciente: zf.optText(200),
  validade: zf.optDate(),
  observacao: zf.obs(),
});

export async function salvarOrcamento(id: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  id = argIntOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: number | null = null;
  try {
    if (id) {
      const orcamentoId = id;
      await db.$transaction(async (tx) => {
        await exigirOrcamentoEditavelTx(tx, orcamentoId);
        await tx.orcamento.update({ where: { id: orcamentoId }, data: parsed.data });
      });
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
  orcamentoId = argInt(orcamentoId);
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const { produtoId, quantidade } = parsed.data;
    const precoUnit = await db.$transaction(async (tx) => {
      const o = await exigirOrcamentoEditavelTx(tx, orcamentoId);
      const preco = parsed.data.preco ?? (await precosDoHospital(tx, o.hospitalId, [produtoId])).get(produtoId)?.preco ?? 0;
      await tx.orcamentoItem.create({ data: { orcamentoId, produtoId, quantidade, precoUnit: preco } });
      return preco;
    });
    await audit(user.id, "adicionar item", "Orcamento", orcamentoId, `${produtoId} x${quantidade} @ ${precoUnit}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/comercial/orcamentos/${orcamentoId}`);
  return { ok: true };
}

export async function removerItemOrcamento(itemId: string): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  itemId = argId(itemId);
  try {
    const it = await db.orcamentoItem.findUniqueOrThrow({ where: { id: itemId } });
    await db.$transaction(async (tx) => {
      await exigirOrcamentoEditavelTx(tx, it.orcamentoId);
      await tx.orcamentoItem.delete({ where: { id: itemId } });
    });
    await audit(user.id, "remover item", "Orcamento", it.orcamentoId, it.produtoId);
    revalidatePath(`/comercial/orcamentos/${it.orcamentoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function mudarStatusOrcamento(id: number, status: StatusOrcamento): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  id = argInt(id);
  status = argEnum(status, ["RASCUNHO", "ENVIADO", "APROVADO", "RECUSADO"] as const);
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
