"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { TIPOS_PLANO } from "./plano-regras";
import { alternarCentroCustoTx, alternarContaPlanoTx, criarCentroCustoTx, criarContaPlanoTx } from "./plano-servico";

const tiposValidos = TIPOS_PLANO.map((t) => t.value) as [string, ...string[]];

const schemaConta = z.object({
  codigo: zf.text("Informe o código").transform((v) => v.trim()),
  nome: zf.text("Informe o nome").transform((v) => v.trim()),
  paiId: zf.optText(),
  tipo: z.enum(tiposValidos, { error: "Escolha o tipo" }),
  analitica: zf.bool(),
});

function revalidar() {
  revalidatePath("/financeiro/plano-contas");
  revalidatePath("/financeiro/dre");
}

/** Cria uma conta ou um grupo no plano. */
export async function criarContaPlano(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaConta, fd);
  if (!parsed.success) return parsed.state;
  const d = parsed.data;
  try {
    const c = await db.$transaction((tx) => criarContaPlanoTx(tx, d));
    await audit(user.id, "criar", "PlanoConta", c.id, `${c.codigo} ${c.nome}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Inativa ou reativa uma conta. Contas do sistema não podem ser inativadas; grupo só inativa sem filhas ativas. */
export async function alternarContaPlano(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const id = fd.get("id");
  if (typeof id !== "string" || !id) return { error: "Conta inválida." };
  try {
    const c = await db.$transaction((tx) => alternarContaPlanoTx(tx, id));
    await audit(user.id, c.eraAtiva ? "inativar" : "reativar", "PlanoConta", id, c.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

const schemaCentro = z.object({ codigo: zf.text("Informe o código").transform((v) => v.trim()), nome: zf.text("Informe o nome").transform((v) => v.trim()) });

export async function criarCentroCusto(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaCentro, fd);
  if (!parsed.success) return parsed.state;
  try {
    const c = await db.$transaction((tx) => criarCentroCustoTx(tx, parsed.data));
    await audit(user.id, "criar", "CentroCusto", c.id, `${c.codigo} ${c.nome}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

export async function alternarCentroCusto(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const id = fd.get("id");
  if (typeof id !== "string" || !id) return { error: "Centro de custo inválido." };
  try {
    const c = await db.$transaction((tx) => alternarCentroCustoTx(tx, id));
    await audit(user.id, c.eraAtivo ? "inativar" : "reativar", "CentroCusto", id, c.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
