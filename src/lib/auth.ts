import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Perfil } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { mfaObrigatoria } from "@/lib/auth-config";
import { assinarToken, verifyToken } from "@/lib/auth-token";
import { cookieSeguro, nomeCookieMfa, nomeCookieSessao } from "@/lib/auth-cookie";

/** Nome do cookie de sessão (com prefixo __Host- em produção: src/lib/auth-cookie.ts). */
export const SESSION_COOKIE = nomeCookieSessao();
/** Validade absoluta da sessão: não se estende com o uso (quem esquece o computador aberto perde a sessão no dia). */
const SESSION_DAYS = 1;
/** Entre a senha conferida e o código do aplicativo autenticador. */
const MFA_PENDENTE_MIN = 5;

/**
 * O que falta para a sessão valer por inteiro: "senha" = trocar a senha provisória (criada ou redefinida pelo admin);
 * "mfa" = cadastrar o aplicativo autenticador (perfil que exige 2º fator). Com pendência, só as telas de /login/* abrem.
 */
export type Pendencia = "senha" | "mfa";
export type SessionUser = { id: string; nome: string; email: string; perfil: Perfil; mfaAtivo: boolean; pendencia: Pendencia | null };

const atributos = (expires: Date) => ({ httpOnly: true, secure: cookieSeguro(), sameSite: "lax" as const, path: "/", expires });

/** Cria a sessão (sempre um token novo: um cookie anterior, mesmo plantado por terceiros, é substituído). */
export async function createSession(userId: string, versao: number) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await assinarToken(userId, versao, expires, "sessao");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, atributos(expires));
  store.delete(nomeCookieMfa());
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(nomeCookieMfa());
}

export { verifyToken };

/** Senha conferida, falta o código: cookie curto e separado (não abre nenhuma tela além do /login). */
export async function criarMfaPendente(userId: string, versao: number) {
  const expires = new Date(Date.now() + MFA_PENDENTE_MIN * 60 * 1000);
  const token = await assinarToken(userId, versao, expires, "mfa");
  (await cookies()).set(nomeCookieMfa(), token, atributos(expires));
}

export async function lerMfaPendente() {
  return verifyToken((await cookies()).get(nomeCookieMfa())?.value, "mfa");
}

export async function apagarMfaPendente() {
  (await cookies()).delete(nomeCookieMfa());
}

/** Usuário logado (memoizado por request) ou null. Inclui a pendência de primeiro acesso, se houver. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const tok = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!tok) return null;
  const user = await db.usuario.findUnique({
    where: { id: tok.id },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, sessaoVersao: true, senhaExpirada: true, mfaAtivadoEm: true },
  });
  if (!user || !user.ativo || user.sessaoVersao !== tok.versao) return null; // senha trocada ou logout: sessão antiga não vale
  const mfaAtivo = user.mfaAtivadoEm !== null;
  const pendencia: Pendencia | null = user.senhaExpirada ? "senha" : !mfaAtivo && mfaObrigatoria(user.perfil) ? "mfa" : null;
  return { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, mfaAtivo, pendencia };
});

export const TELA_PENDENCIA: Record<Pendencia, string> = { senha: "/login/trocar-senha", mfa: "/login/ativar-mfa" };

/**
 * Exige usuário logado e, opcionalmente, um dos perfis informados.
 * ADMIN sempre tem acesso. Use no início de toda page e Server Action.
 * Com pendência de primeiro acesso (senha provisória, 2º fator obrigatório não cadastrado), manda para a tela dela.
 */
export async function requireUser(perfis?: Perfil[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.pendencia) redirect(TELA_PENDENCIA[user.pendencia]);
  if (perfis && user.perfil !== "ADMIN" && !perfis.includes(user.perfil)) {
    // page: manda para a tela "sem acesso" (um throw na renderização vira "Minified React error #441" em produção);
    // Server Action (cabeçalho next-action, node_modules/next/dist/client/components/app-router-headers.js): erro
    // de negócio, que o formulário mostra
    if (!(await ehServerAction())) redirect("/sem-acesso");
    throw new ErroNegocio("Acesso negado para o seu perfil.");
  }
  return user;
}

/** A requisição atual é uma Server Action? Fora de requisição (testes, scripts) responde sim: lança em vez de redirecionar. */
async function ehServerAction(): Promise<boolean> {
  try {
    return (await headers()).has("next-action");
  } catch {
    return true;
  }
}

/** Só para as telas de primeiro acesso (/login/trocar-senha, /login/ativar-mfa): sessão válida, com ou sem pendência. */
export async function requireUserPendente(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Versão para route handlers (download, CSV, API): em vez de lançar (o Next transforma em 500), devolve a resposta
 * 401 (sem sessão) ou 403 (perfil sem acesso ou primeiro acesso não concluído). Uso:
 *   const r = await exigirUsuarioRota(["FINANCEIRO"]);
 *   if (r instanceof Response) return r;
 */
export async function exigirUsuarioRota(perfis?: Perfil[]): Promise<SessionUser | Response> {
  const user = await getUser();
  if (!user) return new Response("Sessão expirada. Entre de novo.", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.pendencia) return new Response("Conclua o primeiro acesso (troca de senha ou verificação em duas etapas).", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (perfis && user.perfil !== "ADMIN" && !perfis.includes(user.perfil)) {
    return new Response("Acesso negado para o seu perfil.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return user;
}
