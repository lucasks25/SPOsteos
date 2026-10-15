"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/** Guarda a escolha de tema (claro, escuro ou automático) num cookie; sem cookie o CSS segue o sistema operacional. */
export async function definirTema(fd: FormData) {
  const v = String(fd.get("tema") ?? "");
  const store = await cookies();
  if (v === "claro" || v === "escuro") store.set("opme_tema", v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else store.delete("opme_tema");
  revalidatePath("/", "layout");
}
