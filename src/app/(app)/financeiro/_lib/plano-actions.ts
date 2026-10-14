"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { TIPOS_PLANO, erroNovaConta } from "./plano-regras";

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
    const pai = d.paiId ? await db.planoConta.findUnique({ where: { id: d.paiId }, select: { tipo: true, analitica: true, ativo: true, codigo: true, nome: true } }) : null;
    if (d.paiId && !pai) throw new ErroNegocio("Grupo não encontrado.");
    const erro = erroNovaConta({ codigo: d.codigo, tipo: d.tipo as never }, pai);
    if (erro) throw new ErroNegocio(erro);
    if (await db.planoConta.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) throw new ErroNegocio(`Já existe uma conta com o código ${d.codigo}.`);
    const c = await db.planoConta.create({ data: { codigo: d.codigo, nome: d.nome, tipo: d.tipo as never, paiId: d.paiId, analitica: d.analitica } });
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
    const c = await db.planoConta.findUnique({ where: { id }, select: { ativo: true, chaveSistema: true, nome: true, pai: { select: { ativo: true } }, _count: { select: { filhos: { where: { ativo: true } } } } } });
    if (!c) throw new ErroNegocio("Conta não encontrada.");
    if (c.ativo) {
      if (c.chaveSistema) throw new ErroNegocio(`"${c.nome}" é usada pelo sistema e não pode ser inativada.`);
      if (c._count.filhos > 0) throw new ErroNegocio("Inative primeiro as contas dentro deste grupo.");
    } else if (c.pai && !c.pai.ativo) {
      throw new ErroNegocio("Reative primeiro o grupo desta conta.");
    }
    await db.planoConta.update({ where: { id }, data: { ativo: !c.ativo } });
    await audit(user.id, c.ativo ? "inativar" : "reativar", "PlanoConta", id, c.nome);
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
    if (await db.centroCusto.findUnique({ where: { codigo: parsed.data.codigo }, select: { id: true } })) throw new ErroNegocio(`Já existe um centro de custo com o código ${parsed.data.codigo}.`);
    const c = await db.centroCusto.create({ data: parsed.data });
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
    const c = await db.centroCusto.findUnique({ where: { id }, select: { ativo: true, nome: true } });
    if (!c) throw new ErroNegocio("Centro de custo não encontrado.");
    await db.centroCusto.update({ where: { id }, data: { ativo: !c.ativo } });
    await audit(user.id, c.ativo ? "inativar" : "reativar", "CentroCusto", id, c.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
