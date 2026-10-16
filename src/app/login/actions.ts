"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { autenticar } from "@/lib/auth-login";
import { audit, type ActionState } from "@/lib/forms";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  // x-forwarded-for só é confiável atrás de um proxy conhecido (Vercel, nginx) que o sobrescreve.
  // Sem o cabeçalho não há IP confiável: só vale o limite por e-mail (uma chave "ip:local" compartilhada deixaria qualquer um bloquear todos).
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64) || null;
  const r = await autenticar(String(fd.get("email") ?? ""), String(fd.get("senha") ?? ""), ip);
  if (!r.ok) return { error: r.erro };
  await createSession(r.user.id, r.user.sessaoVersao);
  await audit(r.user.id, "login", "Usuario", r.user.id);
  redirect("/");
}

export async function logout() {
  const user = await getUser();
  // sobe a versão: derruba também a sessão em outros aparelhos
  if (user) {
    await db.usuario.update({ where: { id: user.id }, data: { sessaoVersao: { increment: 1 } } });
    await audit(user.id, "logout", "Usuario", user.id);
  }
  await destroySession();
  redirect("/login");
}
