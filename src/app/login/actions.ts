"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { apagarMfaPendente, createSession, criarMfaPendente, destroySession, getUser, lerMfaPendente, requireUserPendente } from "@/lib/auth";
import { autenticar, trocarSenha } from "@/lib/auth-login";
import { confirmarCadastroMfa, iniciarCadastroMfa, verificarSegundoFator } from "@/lib/auth-mfa";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { ipDaRequisicao } from "@/lib/ip";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  // IP só de proxy confiável (TRUST_PROXY); sem ele, só vale o limite por e-mail (src/lib/ip.ts)
  const ip = await ipDaRequisicao();
  const r = await autenticar(String(fd.get("email") ?? ""), String(fd.get("senha") ?? ""), ip);
  if (!r.ok) return { error: r.erro };
  if (r.user.mfa) {
    // senha certa, falta o código do aplicativo: nenhuma sessão ainda, só o cookie curto da 2ª etapa
    await criarMfaPendente(r.user.id, r.user.sessaoVersao);
    redirect("/login");
  }
  await createSession(r.user.id, r.user.sessaoVersao);
  await audit(r.user.id, "login", "Usuario", r.user.id);
  redirect("/");
}

/** 2ª etapa do login: código do aplicativo autenticador (ou de recuperação) de quem já passou pela senha. */
export async function confirmarCodigoLogin(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = await lerMfaPendente();
  if (!p) return { error: "O tempo para digitar o código acabou. Entre de novo com e-mail e senha." };
  const r = await verificarSegundoFator(p.id, String(fd.get("codigo") ?? "").slice(0, 40), "login");
  if (!r.ok) return { error: r.erro };
  // a senha pode ter sido trocada (ou a conta desativada) entre as duas etapas
  const u = await db.usuario.findUnique({ where: { id: p.id }, select: { ativo: true, sessaoVersao: true } });
  if (!u?.ativo || u.sessaoVersao !== p.versao) {
    await apagarMfaPendente();
    return { error: "Entre de novo com e-mail e senha." };
  }
  await createSession(p.id, u.sessaoVersao);
  await audit(p.id, "login", "Usuario", p.id, r.recuperacao ? `com código de recuperação (restam ${r.restantes})` : "com 2º fator");
  redirect("/");
}

/** Volta da 2ª etapa para o formulário de e-mail e senha. */
export async function cancelarCodigoLogin() {
  await apagarMfaPendente();
  redirect("/login");
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

// ───────── primeiro acesso (sessão com pendência: src/lib/auth.ts, Pendencia) ─────────

/** Troca obrigatória da senha provisória (usuário novo ou senha redefinida pelo admin). */
export async function trocarSenhaObrigatoria(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUserPendente();
  const nova = String(fd.get("nova") ?? "");
  if (nova !== String(fd.get("confirma") ?? "")) return { error: "Verifique os campos destacados.", fieldErrors: { confirma: "As duas senhas novas não conferem." } };
  try {
    const r = await trocarSenha(user.id, String(fd.get("atual") ?? ""), nova);
    if (!r.ok) return r.campo ? { error: "Verifique os campos destacados.", fieldErrors: { [r.campo]: r.erro } } : { error: r.erro };
    await createSession(user.id, r.sessaoVersao);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/"); // se o perfil exigir 2º fator ainda não cadastrado, o requireUser leva ao cadastro
}

/** Gera a chave do aplicativo autenticador (cadastro pendente até confirmar com um código). */
export async function gerarChaveMfa(): Promise<ActionState> {
  const user = await requireUserPendente();
  if (user.pendencia === "senha") return { error: "Troque a senha provisória antes." };
  try {
    const r = await iniciarCadastroMfa(user.id);
    if (!r.ok) return { error: r.erro };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/login/ativar-mfa");
  revalidatePath("/conta/seguranca");
  return { ok: true, aviso: "Chave gerada. Cadastre no aplicativo e digite o código." };
}

export type EstadoCodigos = { ok?: boolean; aviso?: string; error?: string; fieldErrors?: Record<string, string>; codigos?: string[] } | undefined;

/** Confirma o cadastro com o código atual do aplicativo; devolve os códigos de recuperação (mostrados uma vez). */
export async function confirmarMfa(_: EstadoCodigos, fd: FormData): Promise<EstadoCodigos> {
  const user = await requireUserPendente();
  if (user.pendencia === "senha") return { error: "Troque a senha provisória antes." };
  try {
    const r = await confirmarCadastroMfa(user.id, String(fd.get("codigo") ?? "").slice(0, 40));
    if (!r.ok) return { error: r.erro, fieldErrors: { codigo: r.erro } };
    await createSession(user.id, r.sessaoVersao); // as outras sessões (abertas sem 2º fator) caíram
    return { ok: true, codigos: r.codigos };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
