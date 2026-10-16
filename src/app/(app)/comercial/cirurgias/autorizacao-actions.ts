"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId, argIdOuNulo } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { excluirAutorizacaoTx, salvarAutorizacaoTx } from "../_lib/autorizacao-servico";

const PERFIS = ["COMERCIAL"] as const; // ADMIN sempre passa

const itemSchema = z.object({
  produtoId: z.string().min(1, "Selecione o produto"),
  quantidadeSolicitada: zf.int(1),
  quantidadeAutorizada: zf.int(0),
  valorAutorizado: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), zf.money().nullable()),
});

const itensJson = () =>
  z
    .string({ error: "Itens inválidos" })
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Itens inválidos" });
        return z.NEVER;
      }
    })
    .pipe(z.array(itemSchema).max(200, "Itens demais (máximo 200)"));

const schema = z.object({
  numeroGuia: zf.optText(),
  senha: zf.optText(),
  status: z.enum(["SOLICITADA", "AUTORIZADA", "PARCIAL", "NEGADA", "EXPIRADA"], { error: "Escolha a situação" }),
  solicitadaEm: zf.date("Informe a data da solicitação"),
  autorizadaEm: zf.optDate(),
  validade: zf.optDate(),
  observacao: zf.optText(),
  itens: itensJson(),
});

function revalidar(cirurgiaId: string) {
  revalidatePath(`/comercial/cirurgias/${cirurgiaId}`);
  revalidatePath("/comercial/cirurgias");
  revalidatePath("/comercial/agenda");
  revalidatePath("/");
}

/** Cria (id nulo) ou substitui uma guia de autorização do convênio, com os itens solicitados/autorizados. */
export async function salvarAutorizacao(cirurgiaId: string, id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  cirurgiaId = argId(cirurgiaId);
  id = argIdOuNulo(id);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const a = await db.$transaction((tx) => salvarAutorizacaoTx(tx, { cirurgiaId, ...parsed.data }, id ?? undefined));
    await audit(user.id, id ? "editar" : "criar", "AutorizacaoConvenio", a.id, `cirurgia ${cirurgiaId} — ${a.status}${a.numeroGuia ? ` — guia ${a.numeroGuia}` : ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(cirurgiaId);
  return { ok: true };
}

export async function excluirAutorizacao(id: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  id = argId(id);
  try {
    const cirurgiaId = await db.$transaction((tx) => excluirAutorizacaoTx(tx, id));
    await audit(user.id, "excluir", "AutorizacaoConvenio", id, `cirurgia ${cirurgiaId}`);
    revalidar(cirurgiaId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}
