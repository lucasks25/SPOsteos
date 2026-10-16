"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { lerArquivoDoForm } from "@/lib/upload-seguro";
import { caminhoAnexo, ID_SEGURO, pastaUploads } from "../_lib/anexos";

export async function enviarAnexo(cirurgiaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "ESTOQUE"]);
  if (!ID_SEGURO.test(cirurgiaId)) return { error: "Cirurgia inválida." };
  const cirurgia = await db.cirurgia.findUnique({ where: { id: cirurgiaId }, select: { id: true, numero: true } });
  if (!cirurgia) return { error: "Cirurgia não encontrada." };

  const destino = pastaUploads(cirurgia.id);
  try {
    const { buf, ext, nome } = await lerArquivoDoForm(fd);
    const nomeArquivo = `${randomUUID()}.${ext}`;
    await mkdir(destino, { recursive: true });
    await writeFile(path.join(destino, nomeArquivo), buf, { flag: "wx" });
    const anexo = await db.anexo.create({
      data: { cirurgiaId: cirurgia.id, nome, url: `/uploads/cirurgias/${cirurgia.id}/${nomeArquivo}` },
    });
    await audit(user.id, "anexar", "Cirurgia", cirurgia.id, `${anexo.nome} (${anexo.id})`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/comercial/cirurgias/${cirurgia.id}`);
  return { ok: true };
}

export async function excluirAnexo(anexoId: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "ESTOQUE"]);
  const anexo = await db.anexo.findUnique({ where: { id: anexoId } });
  if (!anexo) return { error: "Anexo não encontrado." };
  try {
    await db.anexo.delete({ where: { id: anexoId } });
    const arquivo = caminhoAnexo(anexo.cirurgiaId, anexo.url);
    if (arquivo) await unlink(arquivo).catch(() => undefined);
    await audit(user.id, "excluir anexo", "Cirurgia", anexo.cirurgiaId, `${anexo.nome} (${anexo.id})`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/comercial/cirurgias/${anexo.cirurgiaId}`);
  return { ok: true };
}
