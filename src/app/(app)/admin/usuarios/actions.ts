"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Perfil } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";

const senha = z.string({ error: "Senha obrigatória" }).min(10, "Mínimo de 10 caracteres").max(72, "Máximo de 72 caracteres");

const criarSchema = z.object({
  nome: zf.text(),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  perfil: z.enum(Perfil, { error: "Selecione o perfil" }),
  senha,
});

const editarSchema = z.object({
  nome: zf.text(),
  perfil: z.enum(Perfil, { error: "Selecione o perfil" }),
  ativo: zf.bool(),
});

export async function criarUsuario(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser([]);
  const parsed = parseForm(criarSchema, fd);
  if (!parsed.success) return parsed.state;
  const { senha: s, ...dados } = parsed.data;
  try {
    if (await db.usuario.findUnique({ where: { email: dados.email } })) {
      return { error: "Verifique os campos destacados.", fieldErrors: { email: "E-mail já cadastrado." } };
    }
    const u = await db.usuario.create({ data: { ...dados, senhaHash: await bcrypt.hash(s, 10) } });
    await audit(admin.id, "criar", "Usuario", u.id, `${u.email} (${u.perfil})`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function editarUsuario(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser([]);
  const parsed = parseForm(editarSchema, fd);
  if (!parsed.success) return parsed.state;
  if (id === admin.id && (!parsed.data.ativo || parsed.data.perfil !== "ADMIN")) {
    return { error: "Você não pode desativar nem tirar o perfil de administrador da sua própria conta." };
  }
  try {
    const u = await db.usuario.update({ where: { id }, data: parsed.data });
    await audit(admin.id, "editar", "Usuario", id, `${u.email} perfil=${u.perfil} ativo=${u.ativo}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function redefinirSenha(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser([]);
  const parsed = parseForm(z.object({ senha }), fd);
  if (!parsed.success) return parsed.state;
  try {
    const u = await db.usuario.update({ where: { id }, data: { senhaHash: await bcrypt.hash(parsed.data.senha, 10), sessaoVersao: { increment: 1 } } });
    await audit(admin.id, "redefinir senha", "Usuario", id, u.email);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}
