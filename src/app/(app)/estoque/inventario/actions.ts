"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_EDITAR } from "../_lib/perfis";
import type { Resolucao } from "../_lib/inventario";
import {
  cancelarInventario,
  concluirContagem,
  criarInventario,
  docInventario,
  fecharInventario,
  incluirLoteEncontrado,
  salvarContagem,
  type ResolucaoInput,
} from "../_lib/inventario-servico";

const TX_OPTS = { timeout: 60_000 };

function revalidar(id?: number) {
  revalidatePath("/estoque/inventario");
  if (id) revalidatePath(`/estoque/inventario/${id}`);
  revalidatePath("/estoque/saldos");
}

export async function criarInventarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const parsed = parseForm(z.object({ hospitalId: zf.text("Selecione o hospital"), observacao: zf.optText() }), fd);
  if (!parsed.success) return parsed.state;
  let id: number;
  try {
    const inv = await db.$transaction((tx) => criarInventario(tx, { ...parsed.data, usuario: user.nome }), TX_OPTS);
    id = inv.id;
    await audit(user.id, "criar", "InventarioConsignacao", id, `${docInventario(id)} hospital ${parsed.data.hospitalId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  redirect(`/estoque/inventario/${id}`);
}

/** Campos `c_<itemId>`: vazio apaga a contagem. */
export async function salvarContagemAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const contagens: { itemId: string; contado: number | null }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("c_") || typeof v !== "string") continue;
      const t = v.trim();
      if (t !== "" && !/^\d+$/.test(t)) throw new ErroNegocio("Use só números inteiros na contagem.");
      contagens.push({ itemId: k.slice(2), contado: t === "" ? null : Number(t) });
    }
    await db.$transaction((tx) => salvarContagem(tx, id, contagens), TX_OPTS);
    await audit(user.id, "contar", "InventarioConsignacao", id, `${docInventario(id)}: ${contagens.filter((c) => c.contado !== null).length} item(ns) contados`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function incluirLoteAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const parsed = parseForm(z.object({ loteId: zf.text("Selecione o lote"), contado: zf.int(0) }), fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction((tx) => incluirLoteEncontrado(tx, id, parsed.data), TX_OPTS);
    await audit(user.id, "incluir-lote", "InventarioConsignacao", id, `${docInventario(id)}: lote ${parsed.data.loteId} qtd ${parsed.data.contado}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function concluirContagemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const id = Number(fd.get("id"));
  try {
    await db.$transaction((tx) => concluirContagem(tx, id), TX_OPTS);
    await audit(user.id, "concluir-contagem", "InventarioConsignacao", id, docInventario(id));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function cancelarInventarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const id = Number(fd.get("id"));
  try {
    await db.$transaction((tx) => cancelarInventario(tx, id), TX_OPTS);
    await audit(user.id, "cancelar", "InventarioConsignacao", id, docInventario(id));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

const RESOLUCOES = ["AJUSTE", "COBRAR_HOSPITAL", "JUSTIFICADA"];

/** Campos `res_<itemId>` e `just_<itemId>`. */
export async function fecharInventarioAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const porItem = new Map<string, ResolucaoInput>();
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      const isRes = k.startsWith("res_");
      if (!isRes && !k.startsWith("just_")) continue;
      const itemId = k.slice(isRes ? 4 : 5);
      const cur = porItem.get(itemId) ?? { itemId, resolucao: null, justificativa: null };
      if (isRes) cur.resolucao = RESOLUCOES.includes(v) ? (v as Resolucao) : null;
      else cur.justificativa = v.trim() || null;
      porItem.set(itemId, cur);
    }
    const resumo = await db.$transaction((tx) => fecharInventario(tx, id, [...porItem.values()], user.nome), TX_OPTS);
    await audit(user.id, "fechar", "InventarioConsignacao", id, `${docInventario(id)}: ${resumo.divergentes} divergência(s), faltas ${resumo.unidadesFalta} un. (R$ ${resumo.valorFalta}), sobras ${resumo.unidadesSobra} un.`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}
