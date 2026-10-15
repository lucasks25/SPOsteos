import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Perfil } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

export const SESSION_COOKIE = "opme_session";
const SESSION_DAYS = 1;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  // o valor do .env.example é público: nunca pode valer. Gere um com `openssl rand -hex 32`.
  if (!secret || secret.length < 32 || /troque/i.test(secret)) throw new Error("AUTH_SECRET ausente, curto (mínimo 32 caracteres) ou de exemplo. Gere um com: openssl rand -hex 32");
  return new TextEncoder().encode(secret);
}

export type SessionUser = { id: string; nome: string; email: string; perfil: Perfil };

export async function createSession(userId: string, versao: number) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ sub: userId, v: versao })
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
    return typeof payload.sub === "string" ? { id: payload.sub, versao: typeof payload.v === "number" ? payload.v : -1 } : null;
  } catch {
    return null;
  }
}

/** Usuário logado (memoizado por request) ou null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const tok = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!tok) return null;
  const user = await db.usuario.findUnique({
    where: { id: tok.id },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, sessaoVersao: true },
  });
  if (!user || !user.ativo || user.sessaoVersao !== tok.versao) return null; // senha trocada ou logout: sessão antiga não vale
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
