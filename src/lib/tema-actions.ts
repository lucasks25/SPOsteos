"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { argEnum } from "@/lib/auth-args";

/** Guarda a escolha de tema (claro, escuro ou automático) num cookie; sem cookie o CSS segue o sistema operacional. */
export async function definirTema(fd: FormData) {
  const v = String(fd.get("tema") ?? "");
  const store = await cookies();
  if (v === "claro" || v === "escuro") store.set("opme_tema", v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else store.delete("opme_tema");
  revalidatePath("/", "layout");
}

/**
 * Guarda a posição do menu principal ("esquerda", padrão, ou "topo") no cookie `opme_menu_pos`, lido no servidor por
 * src/app/(app)/layout.tsx para a página já nascer no modo certo (sem piscar). A troca na tela é feita na hora pelo
 * AppShell; esta ação só persiste. Só faz sentido logado (o menu existe só dentro do app), então segue a regra de toda
 * action: requireUser no primeiro comando e argumento validado por argEnum (tests/seguranca/actions-guarda.test.ts).
 * Gravar cookie numa Server Action já faz o Next re-renderizar a página atual (docs: 07-mutating-data, "Cookies").
 */
export async function definirPosicaoMenu(posicao: unknown) {
  await requireUser();
  const v = argEnum(posicao, ["esquerda", "topo"] as const);
  (await cookies()).set("opme_menu_pos", v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}
