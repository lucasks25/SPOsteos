"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";

const PERFIS = ["COMERCIAL"] as const;

const schema = z
  .object({ nome: zf.text(), vigenciaInicio: zf.optDate(), vigenciaFim: zf.optDate() })
  .refine((d) => !d.vigenciaInicio || !d.vigenciaFim || d.vigenciaFim >= d.vigenciaInicio, { path: ["vigenciaFim"], message: "Fim antes do início" });

export async function salvarTabela(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  let novoId: string | null = null;
  try {
    const t = id ? await db.tabelaPreco.update({ where: { id }, data: parsed.data }) : await db.tabelaPreco.create({ data: parsed.data });
    await audit(user.id, id ? "editar" : "criar", "TabelaPreco", t.id, t.nome);
    if (!id) novoId = t.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/comercial/tabelas-preco");
  if (novoId) redirect(`/comercial/tabelas-preco/${novoId}`);
  return { ok: true };
}

const itemSchema = z.object({ produtoId: zf.text("Selecione o produto"), preco: zf.optMoney() });

export async function salvarPreco(tabelaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const produto = await db.produto.findUniqueOrThrow({ where: { id: parsed.data.produtoId } });
    const preco = parsed.data.preco ?? produto.precoBase;
    await db.tabelaPrecoItem.upsert({
      where: { tabelaId_produtoId: { tabelaId, produtoId: produto.id } },
      create: { tabelaId, produtoId: produto.id, preco },
      update: { preco },
    });
    await audit(user.id, "preço", "TabelaPreco", tabelaId, `${produto.codigo} = ${preco}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/comercial/tabelas-preco/${tabelaId}`);
  return { ok: true };
}

export async function removerPreco(itemId: string): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    const it = await db.tabelaPrecoItem.delete({ where: { id: itemId } });
    await audit(user.id, "remover preço", "TabelaPreco", it.tabelaId, it.produtoId);
    revalidatePath(`/comercial/tabelas-preco/${it.tabelaId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

/** Inclui na tabela todos os produtos ativos que ainda não estão nela, pelo preço base. */
export async function incluirTodos(tabelaId: string): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    const produtos = await db.produto.findMany({ where: { ativo: true, precos: { none: { tabelaId } } }, select: { id: true, precoBase: true } });
    await db.tabelaPrecoItem.createMany({ data: produtos.map((p) => ({ tabelaId, produtoId: p.id, preco: p.precoBase })) });
    await audit(user.id, "incluir todos", "TabelaPreco", tabelaId, `${produtos.length} produto(s)`);
    revalidatePath(`/comercial/tabelas-preco/${tabelaId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

export async function excluirTabela(id: string): Promise<ActionState> {
  const user = await requireUser([...PERFIS]);
  try {
    const n = await db.hospital.count({ where: { tabelaPrecoId: id } });
    if (n > 0) return { error: `Tabela usada por ${n} hospital(is). Troque a tabela deles antes.` };
    const t = await db.tabelaPreco.delete({ where: { id } });
    await audit(user.id, "excluir", "TabelaPreco", id, t.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/comercial/tabelas-preco");
  redirect("/comercial/tabelas-preco");
}
