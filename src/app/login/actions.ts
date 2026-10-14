"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { audit, type ActionState } from "@/lib/forms";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const senha = String(fd.get("senha") ?? "");
  if (!email || !senha) return { error: "Informe e-mail e senha." };
  const user = await db.usuario.findUnique({ where: { email } });
  if (!user || !user.ativo || !(await bcrypt.compare(senha, user.senhaHash))) {
    return { error: "E-mail ou senha inválidos." };
  }
  await createSession(user.id);
  await audit(user.id, "login", "Usuario", user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
