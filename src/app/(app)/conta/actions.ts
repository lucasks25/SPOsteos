"use server";

import { revalidatePath } from "next/cache";
import { requireUser, createSession } from "@/lib/auth";
import { encerrarSessoes, trocarSenha } from "@/lib/auth-login";
import { desativarMfa, regenerarCodigos } from "@/lib/auth-mfa";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import type { EstadoCodigos } from "@/app/login/actions";

/** Troca da própria senha (qualquer perfil). Exige a senha atual; derruba as outras sessões e mantém esta. */
export async function trocarMinhaSenha(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const atual = String(fd.get("atual") ?? "");
  const nova = String(fd.get("nova") ?? "");
  const confirma = String(fd.get("confirma") ?? "");
  if (nova !== confirma) return { error: "Verifique os campos destacados.", fieldErrors: { confirma: "As duas senhas novas não conferem." } };
  try {
    const r = await trocarSenha(user.id, atual, nova);
    if (!r.ok) return r.campo ? { error: "Verifique os campos destacados.", fieldErrors: { [r.campo]: r.erro } } : { error: r.erro };
    await createSession(user.id, r.sessaoVersao);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true, aviso: "Senha alterada. As outras sessões abertas foram encerradas." };
}

/** Encerra as sessões em outros aparelhos (sobe a sessaoVersao) e mantém esta. */
export async function encerrarOutrasSessoes(): Promise<ActionState> {
  const user = await requireUser();
  try {
    await createSession(user.id, await encerrarSessoes(user.id));
    await audit(user.id, "encerrar outras sessões", "Usuario", user.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true, aviso: "Pronto: as sessões abertas em outros aparelhos foram encerradas." };
}

/** Novos códigos de recuperação (exige o código atual do aplicativo; os anteriores deixam de valer). */
export async function novosCodigosRecuperacao(_: EstadoCodigos, fd: FormData): Promise<EstadoCodigos> {
  const user = await requireUser();
  try {
    const r = await regenerarCodigos(user.id, String(fd.get("codigo") ?? "").slice(0, 40));
    return r.ok ? { ok: true, codigos: r.codigos } : { error: r.erro };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Desliga o próprio 2º fator (só onde não é obrigatório). */
export async function desligarMfa(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const r = await desativarMfa(user.id, user.perfil, String(fd.get("codigo") ?? "").slice(0, 40));
    if (!r.ok) return { error: r.erro, fieldErrors: { codigo: r.erro } };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/conta/seguranca");
  return { ok: true, aviso: "Verificação em duas etapas desativada." };
}
