"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { audit, type ActionState } from "@/lib/forms";

const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
// hash de uma senha qualquer: quando o e-mail não existe, comparamos contra ele para o tempo de resposta não revelar isso
const HASH_FALSO = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4cF5L8lq7sQ3nZ0f6m9xYk0m2d8e";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const senha = String(fd.get("senha") ?? "").slice(0, 200);
  if (!email || !senha) return { error: "Informe e-mail e senha." };

  // x-forwarded-for só é confiável atrás de um proxy conhecido (Vercel, nginx).
  // Sem o cabeçalho não há IP confiável: só vale o limite por e-mail (uma chave "ip:local" compartilhada deixaria qualquer um bloquear todos).
  const xff = (await headers()).get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64);
  const chaves = [`email:${email}`, ...(xff ? [`ip:${xff}`] : [])];
  const desde = new Date(Date.now() - JANELA_MS);
  // cada falha grava uma linha por chave: bloqueia se QUALQUER chave (o e-mail ou o IP) chegou ao limite
  const porChave = await db.tentativaLogin.groupBy({ by: ["chave"], where: { chave: { in: chaves }, criadaEm: { gte: desde } }, _count: true });
  if (porChave.some((c) => c._count >= MAX_FALHAS)) return { error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };

  const user = await db.usuario.findUnique({ where: { email } });
  const senhaOk = await bcrypt.compare(senha, user?.senhaHash ?? HASH_FALSO);
  if (!user || !user.ativo || !senhaOk) {
    await db.tentativaLogin.createMany({ data: chaves.map((chave) => ({ chave })) });
    await audit(null, "login falhou", "Usuario", undefined, email);
    return { error: "E-mail ou senha inválidos." };
  }
  await db.tentativaLogin.deleteMany({ where: { chave: `email:${email}` } });
  await db.tentativaLogin.deleteMany({ where: { criadaEm: { lt: desde } } }); // limpeza oportunista
  await createSession(user.id, user.sessaoVersao);
  await audit(user.id, "login", "Usuario", user.id);
  redirect("/");
}

export async function logout() {
  const user = await getUser();
  // sobe a versão: derruba também a sessão em outros aparelhos
  if (user) await db.usuario.update({ where: { id: user.id }, data: { sessaoVersao: { increment: 1 } } });
  await destroySession();
  redirect("/login");
}
