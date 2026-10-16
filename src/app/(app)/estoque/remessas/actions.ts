"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argInt } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { PERFIS_EDITAR } from "../_lib/perfis";
import { cancelarRemessa, conferirRemessa, criarRemessa, docRemessa, enviarRemessa } from "../_lib/remessas";
import { ErroNegocio } from "@/lib/erros";

const TX_OPTS = { timeout: 30_000 };

const itensSchema = z
  .array(
    z.object({
      produtoId: z.string().min(1, "Produto obrigatório"),
      loteId: z.string().min(1, "Selecione o lote de todos os itens"),
      quantidade: z.number().int("Quantidade deve ser inteira").positive("Quantidade deve ser maior que zero"),
    }),
  )
  .min(1, "Informe ao menos um item");

const novaSchema = z.object({
  hospitalId: zf.text("Selecione o hospital"),
  cirurgiaId: zf.optText(),
  kitId: zf.optText(),
  observacao: zf.optText(),
  itens: z.string({ error: "Informe ao menos um item" }).transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Itens inválidos" });
      return z.NEVER;
    }
  }).pipe(itensSchema),
});

export async function criarRemessaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  const parsed = parseForm(novaSchema, fd);
  if (!parsed.success) {
    const itensErr = parsed.state?.fieldErrors && Object.entries(parsed.state.fieldErrors).find(([k]) => k.startsWith("itens"));
    return itensErr ? { error: itensErr[1], fieldErrors: parsed.state?.fieldErrors } : parsed.state;
  }
  let id: number;
  try {
    const remessa = await db.$transaction((tx) => criarRemessa(tx, parsed.data), TX_OPTS);
    id = remessa.id;
    await audit(user.id, "criar", "Remessa", id, `${docRemessa(id)} — ${parsed.data.itens.length} item(ns)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/estoque/remessas");
  redirect(`/estoque/remessas/${id}`);
}

function idDe(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new ErroNegocio("Remessa inválida.");
  return id;
}

function revalidar(id: number) {
  revalidatePath("/estoque/remessas");
  revalidatePath(`/estoque/remessas/${id}`);
  revalidatePath("/estoque/saldos");
  revalidatePath("/estoque/kardex");
}

export async function enviarRemessaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const id = idDe(fd);
    await db.$transaction((tx) => enviarRemessa(tx, id, user.nome), TX_OPTS);
    await audit(user.id, "enviar", "Remessa", id, docRemessa(id));
    revalidar(id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function cancelarRemessaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  try {
    const id = idDe(fd);
    await db.$transaction((tx) => cancelarRemessa(tx, id));
    await audit(user.id, "cancelar", "Remessa", id, docRemessa(id));
    revalidar(id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

const qtd = z.coerce.number({ error: "Número inválido" }).int("Deve ser inteiro").min(0, "Não pode ser negativo");

export async function conferirRemessaAction(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR);
  id = argInt(id);
  const itens = await db.remessaItem.findMany({ where: { remessaId: id }, select: { id: true, quantidade: true } });
  const fieldErrors: Record<string, string> = {};
  const retornos = itens.map((it) => {
    const dev = qtd.safeParse(fd.get(`dev_${it.id}`) || 0);
    const con = qtd.safeParse(fd.get(`con_${it.id}`) || 0);
    if (!dev.success) fieldErrors[`dev_${it.id}`] = dev.error.issues[0].message;
    if (!con.success) fieldErrors[`con_${it.id}`] = con.error.issues[0].message;
    const devolvido = dev.success ? dev.data : 0;
    const consumido = con.success ? con.data : 0;
    if (dev.success && con.success && devolvido + consumido > it.quantidade) {
      fieldErrors[`con_${it.id}`] = `Devolvido + consumido > enviado (${it.quantidade})`;
    }
    return { itemId: it.id, devolvido, consumido };
  });
  if (Object.keys(fieldErrors).length > 0) return { error: "Verifique as quantidades destacadas.", fieldErrors };
  try {
    await db.$transaction((tx) => conferirRemessa(tx, id, retornos, user.nome), TX_OPTS);
    const dev = retornos.reduce((s, r) => s + r.devolvido, 0);
    const con = retornos.reduce((s, r) => s + r.consumido, 0);
    await audit(user.id, "conferir", "Remessa", id, `${docRemessa(id)} — devolvido ${dev}, consumido ${con}`);
    revalidar(id);
    revalidatePath("/comercial/cirurgias");
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}
