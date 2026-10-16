"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { argBool, argEnum, argId } from "@/lib/auth-args";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { lerArquivoDoForm } from "@/lib/upload-seguro";
import { ESCOPOS, PERFIS_EDITAR_DOCUMENTOS, TIPOS } from "../_lib/documentos";
import { anexarArquivo, atualizarDocumento, criarDocumento, definirAtivo } from "../_lib/documentos-servico";

const dados = {
  titulo: zf.nome("Informe o título"),
  numero: zf.optText(100),
  orgaoEmissor: zf.optText(200),
  emissao: zf.optDate(),
  validade: zf.optDate(),
  observacao: zf.obs(),
};

const schemaNovo = z.object({
  ...dados,
  tipo: z.enum(TIPOS, { error: "Selecione o tipo" }),
  escopo: z.enum(ESCOPOS, { error: "Selecione o escopo" }),
  fornecedorId: zf.optText(),
  fabricanteId: zf.optText(),
  produtoId: zf.optText(),
  substituiId: zf.optText(),
});

function revalidar(id?: string) {
  revalidatePath("/qualidade/documentos");
  if (id) revalidatePath(`/qualidade/documentos/${id}`);
  revalidatePath("/");
}

/** Cria o documento (com arquivo opcional). Com `substituiId`, marca o anterior como substituído. */
export async function criarDocumentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  const parsed = parseForm(schemaNovo, fd);
  if (!parsed.success) return parsed.state;
  const { tipo, escopo, fornecedorId, fabricanteId, produtoId, substituiId, ...resto } = parsed.data;
  const temArquivo = fd.get("arquivo") instanceof File && (fd.get("arquivo") as File).size > 0;
  let id: string;
  try {
    const arquivo = temArquivo ? await lerArquivoDoForm(fd) : null;
    const doc = await criarDocumento({ tipo, ...resto }, { escopo, fornecedorId, fabricanteId, produtoId }, { usuarioId: user.id, substituiId, arquivo });
    id = doc.id;
    await audit(user.id, "criar", "Documento", id, `${tipo} ${resto.titulo}${substituiId ? ` (substitui ${substituiId})` : ""}${arquivo ? ` com arquivo ${arquivo.nome}` : ""}`);
    if (substituiId) await audit(user.id, "substituir", "Documento", substituiId, `substituído por ${id}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  redirect(`/qualidade/documentos/${id}`);
}

export async function editarDocumentoAction(id: string, tipo: (typeof TIPOS)[number], _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  id = argId(id);
  tipo = argEnum(tipo, TIPOS);
  const parsed = parseForm(z.object(dados), fd);
  if (!parsed.success) return parsed.state;
  try {
    await atualizarDocumento(id, { tipo, ...parsed.data });
    await audit(user.id, "editar", "Documento", id, parsed.data.titulo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

/** Nova versão do arquivo (a mais recente é a vigente). */
export async function enviarArquivoDocumentoAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  id = argId(id);
  try {
    const arquivo = await lerArquivoDoForm(fd);
    const a = await anexarArquivo(id, arquivo, user.id);
    await audit(user.id, "anexar", "Documento", id, `${a.nome} (${a.id}) sha256 ${a.hash.slice(0, 12)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}

/** Documento não é apagado (histórico regulatório): só inativa ou reativa. */
export async function alternarAtivoDocumentoAction(id: string, ativar: boolean): Promise<ActionState> {
  const user = await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  id = argId(id);
  ativar = argBool(ativar);
  try {
    await definirAtivo(id, ativar);
    await audit(user.id, ativar ? "reativar" : "inativar", "Documento", id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(id);
  return { ok: true };
}
