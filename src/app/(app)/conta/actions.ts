"use server";

import { requireUser, createSession } from "@/lib/auth";
import { trocarSenha } from "@/lib/auth-login";
import { errorMessage, type ActionState } from "@/lib/forms";

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
