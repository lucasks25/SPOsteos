import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Perfil } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

export const SESSION_COOKIE = "opme_session";
const SESSION_DAYS = 7;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET não configurado");
  return new TextEncoder().encode(secret);
}

export type SessionUser = { id: string; nome: string; email: string; perfil: Perfil };

export async function createSession(userId: string) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secretKey());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function verifyToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Usuário logado (memoizado por request) ou null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const userId = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await db.usuario.findUnique({
    where: { id: userId },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true },
  });
  if (!user || !user.ativo) return null;
  return { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil };
});

/**
 * Exige usuário logado e, opcionalmente, um dos perfis informados.
 * ADMIN sempre tem acesso. Use no início de toda page e Server Action.
 */
export async function requireUser(perfis?: Perfil[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (perfis && user.perfil !== "ADMIN" && !perfis.includes(user.perfil)) {
    throw new ErroNegocio("Acesso negado para o seu perfil.");
  }
  return user;
}
