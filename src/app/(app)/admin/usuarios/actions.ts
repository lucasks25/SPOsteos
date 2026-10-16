"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Perfil } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argId } from "@/lib/auth-args";
import { zerarMfaDeOutro } from "@/lib/auth-mfa";
import { problemaSenha, SENHA_MIN } from "@/lib/auth-senha";
import { editarUsuarioTx } from "../_lib/usuarios-servico";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";

// política única (src/lib/auth-senha.ts): a mesma da troca pelo próprio usuário; a senha do admin é provisória
const senha = z.string({ error: "Senha obrigatória" }).min(SENHA_MIN, `Mínimo de ${SENHA_MIN} caracteres`);

const criarSchema = z
  .object({
    nome: zf.nome(),
    email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
    perfil: z.enum(Perfil, { error: "Selecione o perfil" }),
    senha,
  })
  .superRefine((d, ctx) => {
    const p = problemaSenha(d.senha, d);
    if (p) ctx.addIssue({ code: "custom", path: ["senha"], message: p });
  });

const editarSchema = z.object({
  nome: zf.nome(),
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
    // senha provisória: o usuário cria a dele no primeiro acesso (o admin não fica sabendo a senha de ninguém)
    const u = await db.usuario.create({ data: { ...dados, senhaHash: await bcrypt.hash(s, 10), senhaExpirada: true } });
    await audit(admin.id, "criar", "Usuario", u.id, `${u.email} (${u.perfil}); senha provisória`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function editarUsuario(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser([]);
  id = argId(id);
  const parsed = parseForm(editarSchema, fd);
  if (!parsed.success) return parsed.state;
  try {
    const r = await db.$transaction((tx) => editarUsuarioTx(tx, admin.id, id, parsed.data));
    // governança: mudança de perfil/ativação com antes → depois (quem ganhou acesso a quê)
    await audit(admin.id, "editar", "Usuario", id, `${r.email} — ${r.mudou || "sem alteração"}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function redefinirSenha(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser([]);
  id = argId(id);
  // a própria senha só com a senha atual (/conta/senha): sessão de admin roubada não troca a senha do admin
  if (id === admin.id) return { error: "Para a sua própria senha, use Minha conta → Trocar minha senha." };
  const parsed = parseForm(z.object({ senha }), fd);
  if (!parsed.success) return parsed.state;
  try {
    const alvo = await db.usuario.findUnique({ where: { id }, select: { email: true, nome: true } });
    if (!alvo) return { error: "Usuário não encontrado." };
    const p = problemaSenha(parsed.data.senha, alvo);
    if (p) return { error: "Verifique os campos destacados.", fieldErrors: { senha: p } };
    // provisória: derruba as sessões e obriga a troca no próximo acesso
    await db.usuario.update({ where: { id }, data: { senhaHash: await bcrypt.hash(parsed.data.senha, 10), senhaExpirada: true, sessaoVersao: { increment: 1 } } });
    await audit(admin.id, "redefinir senha", "Usuario", id, `${alvo.email}; senha provisória (troca obrigatória no próximo acesso)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/admin/usuarios/${id}`);
  return { ok: true, aviso: "Senha provisória definida. A pessoa vai criar a dela no próximo acesso." };
}

/** Zera o 2º fator de outra pessoa (celular perdido e sem códigos de recuperação): ela cadastra de novo ao entrar. */
export async function zerarMfa(id: string): Promise<ActionState> {
  const admin = await requireUser([]);
  id = argId(id);
  try {
    const r = await zerarMfaDeOutro(admin.id, id);
    if (!r.ok) return { error: r.erro };
    await audit(admin.id, "zerar 2º fator", "Usuario", id, `${r.email}; sessões encerradas`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/admin/usuarios/${id}`);
  return { ok: true, aviso: "Verificação em duas etapas zerada. A pessoa cadastra o aplicativo de novo no próximo acesso." };
}
