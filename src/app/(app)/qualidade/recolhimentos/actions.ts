"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { idInt } from "@/lib/ids";
import { argId, argInt } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { CLASSES, ORIGENS, PERFIS_OPERAR_RECOLHIMENTO, PERFIS_RECOLHER, docRecolhimento } from "../_lib/recolhimento";
import {
  abrirRecolhimento,
  atualizarFoto,
  cancelarRecolhimento,
  comunicarPacientes,
  concluirRecolhimento,
  justificarAlvo,
  recolherFisico,
  registrarComunicado,
  registrarNota,
} from "../_lib/recolhimento-servico";

const TX_OPTS = { timeout: 60_000 };
const ENT = "Recolhimento";

function revalidar(id?: number) {
  revalidatePath("/qualidade/recolhimentos");
  if (id) revalidatePath(`/qualidade/recolhimentos/${id}`);
  revalidatePath("/qualidade/lotes");
  revalidatePath("/estoque/saldos");
}

const abrirSchema = z.object({
  origem: z.enum(ORIGENS, { error: "Selecione a origem" }),
  classe: z.enum(CLASSES, { error: "Selecione a classe" }),
  motivo: zf.text("Informe o motivo").pipe(z.string().max(2000)),
  referencia: zf.optText(),
  prazo: zf.optDate(),
  observacao: zf.optText(),
});

export async function abrirRecolhimentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  const parsed = parseForm(abrirSchema, fd);
  if (!parsed.success) return parsed.state;
  const loteIds = fd.getAll("loteId").filter((v): v is string => typeof v === "string" && v !== "");
  if (loteIds.length === 0) return { error: "Selecione ao menos um lote." };
  let id: number;
  try {
    const r = await db.$transaction((tx) => abrirRecolhimento(tx, { ...parsed.data, loteIds, usuario: user.nome }), TX_OPTS);
    id = r.recolhimento.id;
    await audit(user.id, "abrir", ENT, id, `${docRecolhimento(id)} ${parsed.data.origem} classe ${parsed.data.classe}; ${loteIds.length} lote(s) bloqueado(s); ${r.foto.alvos} local(is), ${r.foto.pacientes} uso(s) em cirurgia`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  redirect(`/qualidade/recolhimentos/${id}`);
}

const idDe = (fd: FormData) => idInt(fd.get("id")) ?? 0; // inválido → 0 → "não encontrado" (antes: NaN ia ao banco)
const txt = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? String(fd.get(k)).trim() : "");

export async function atualizarFotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  const id = idDe(fd);
  try {
    const r = await db.$transaction((tx) => atualizarFoto(tx, id, user.nome), TX_OPTS);
    await audit(user.id, "atualizar", ENT, id, `${docRecolhimento(id)}: +${r.alvos} local(is), +${r.pacientes} uso(s)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function comunicarHospitalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  const id = idDe(fd);
  const localId = txt(fd, "localId");
  try {
    const n = await db.$transaction((tx) => registrarComunicado(tx, id, localId, user.nome), TX_OPTS);
    await audit(user.id, "comunicar", ENT, id, `${docRecolhimento(id)}: local ${localId}, ${n} item(ns)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

/** Campos `p_<id>` marcados e `observacao`. */
export async function comunicarPacientesAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  id = argInt(id);
  const ids = [...fd.keys()].filter((k) => k.startsWith("p_")).map((k) => k.slice(2));
  try {
    const n = await db.$transaction((tx) => comunicarPacientes(tx, id, ids, user.nome, txt(fd, "observacao")), TX_OPTS);
    await audit(user.id, "comunicar-pacientes", ENT, id, `${docRecolhimento(id)}: ${n} paciente(s)/cirurgia(s)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function recolherAction(id: number, alvoId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_RECOLHER);
  id = argInt(id);
  alvoId = argId(alvoId);
  const parsed = parseForm(z.object({ quantidade: zf.int(1) }), fd);
  if (!parsed.success) return parsed.state;
  try {
    const r = await db.$transaction((tx) => recolherFisico(tx, id, { alvoId, quantidade: parsed.data.quantidade }, user.nome), TX_OPTS);
    await audit(user.id, "recolher", ENT, id, `${docRecolhimento(id)}: alvo ${alvoId} ${parsed.data.quantidade} un. (restam ${r.restante})`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function justificarAction(id: number, alvoId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  id = argInt(id);
  alvoId = argId(alvoId);
  const texto = txt(fd, "justificativa") || null;
  try {
    await db.$transaction((tx) => justificarAlvo(tx, id, alvoId, texto, user.nome), TX_OPTS);
    await audit(user.id, "justificar", ENT, id, `${docRecolhimento(id)}: alvo ${alvoId} ${texto ?? "(removida)"}`.slice(0, 900));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function notaAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  id = argInt(id);
  const texto = txt(fd, "texto");
  try {
    await db.$transaction((tx) => registrarNota(tx, id, texto, user.nome), TX_OPTS);
    await audit(user.id, "registrar-acao", ENT, id, `${docRecolhimento(id)}: ${texto}`.slice(0, 900));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function concluirAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  id = argInt(id);
  try {
    await db.$transaction((tx) => concluirRecolhimento(tx, id, txt(fd, "conclusao"), user.nome), TX_OPTS);
    await audit(user.id, "concluir", ENT, id, docRecolhimento(id));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

export async function cancelarAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  id = argInt(id);
  try {
    const des = await db.$transaction((tx) => cancelarRecolhimento(tx, id, txt(fd, "motivo"), user.nome), TX_OPTS);
    await audit(user.id, "cancelar", ENT, id, `${docRecolhimento(id)}: desbloqueados ${des.join(", ") || "nenhum"}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}
