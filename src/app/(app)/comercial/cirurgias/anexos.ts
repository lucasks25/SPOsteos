"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { caminhoAnexo, ID_SEGURO, pastaUploads } from "../_lib/anexos";

const MAX_BYTES = 10 * 1024 * 1024;

/** Tipos aceitos: extensão gerada pelo servidor + assinatura (magic bytes) conferida no conteúdo. */
const TIPOS: { ext: string; mimes: string[]; magic: number[] }[] = [
  { ext: "pdf", mimes: ["application/pdf"], magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: "png", mimes: ["image/png"], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"], magic: [0xff, 0xd8, 0xff] },
];

function nomeExibicao(original: string, ext: string) {
  const base = path.basename(original).replace(/\.[^.]*$/, "");
  const limpo = base.normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${limpo || "arquivo"}.${ext}`;
}

export async function enviarAnexo(cirurgiaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["COMERCIAL", "ESTOQUE"]);
  const file = fd.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { error: "Arquivo maior que 10 MB." };
  if (!ID_SEGURO.test(cirurgiaId)) return { error: "Cirurgia inválida." };
  const cirurgia = await db.cirurgia.findUnique({ where: { id: cirurgiaId }, select: { id: true, numero: true } });
  if (!cirurgia) return { error: "Cirurgia não encontrada." };

  const buf = Buffer.from(await file.arrayBuffer());
  const tipo = TIPOS.find((t) => t.magic.every((b, i) => buf[i] === b));
  if (!tipo || (file.type && !tipo.mimes.includes(file.type))) {
    return { error: "Tipo de arquivo não permitido. Envie PDF, JPG ou PNG." };
  }

  const nomeArquivo = `${randomUUID()}.${tipo.ext}`;
  const destino = pastaUploads(cirurgia.id);
  try {
    await mkdir(destino, { recursive: true });
    await writeFile(path.join(destino, nomeArquivo), buf, { flag: "wx" });
    const anexo = await db.anexo.create({
      data: { cirurgiaId: cirurgia.id, nome: nomeExibicao(file.name, tipo.ext), url: `/uploads/cirurgias/${cirurgia.id}/${nomeArquivo}` },
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
