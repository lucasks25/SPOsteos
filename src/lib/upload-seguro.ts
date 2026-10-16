import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { ErroNegocio } from "@/lib/erros";

/**
 * Regras de upload seguro compartilhadas (anexos de cirurgia e documentos/licenças):
 * limite de tamanho, tipo conferido pela assinatura (magic bytes) e pelo MIME declarado,
 * extensão decidida pelo servidor e nome de exibição sanitizado. Nunca confie no nome enviado.
 */
export const MAX_BYTES = 10 * 1024 * 1024;

export const ID_SEGURO = /^[a-z0-9]+$/i;
/** Nome de arquivo gravado no disco: UUID + extensão decidida pelo servidor. */
export const NOME_ARQUIVO_SEGURO = /^[a-f0-9-]{36}\.(pdf|png|jpg)$/;
export const MIME_POR_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };

/** Tipos aceitos: extensão gerada pelo servidor + assinatura (magic bytes) conferida no conteúdo. */
const TIPOS: { ext: "pdf" | "png" | "jpg"; mimes: string[]; magic: number[] }[] = [
  { ext: "pdf", mimes: ["application/pdf"], magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: "png", mimes: ["image/png"], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"], magic: [0xff, 0xd8, 0xff] },
];

export function nomeExibicao(original: string, ext: string) {
  const base = path.basename(original).replace(/\.[^.]*$/, "");
  const limpo = base.normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${limpo || "arquivo"}.${ext}`;
}

export type ArquivoValidado = { buf: Buffer; ext: "pdf" | "png" | "jpg"; mime: string; nome: string; hash: string; tamanho: number };

/** Valida o conteúdo (tamanho, assinatura, MIME declarado). Lança ErroNegocio com a mensagem para o usuário. */
export function validarArquivo(buf: Buffer, nomeOriginal: string, mimeDeclarado?: string): ArquivoValidado {
  if (buf.length === 0) throw new ErroNegocio("Selecione um arquivo.");
  if (buf.length > MAX_BYTES) throw new ErroNegocio("Arquivo maior que 10 MB.");
  const tipo = TIPOS.find((t) => t.magic.every((b, i) => buf[i] === b));
  if (!tipo || (mimeDeclarado && !tipo.mimes.includes(mimeDeclarado))) throw new ErroNegocio("Tipo de arquivo não permitido. Envie PDF, JPG ou PNG.");
  return {
    buf,
    ext: tipo.ext,
    mime: MIME_POR_EXT[tipo.ext],
    nome: nomeExibicao(nomeOriginal, tipo.ext),
    hash: createHash("sha256").update(buf).digest("hex"),
    tamanho: buf.length,
  };
}

/** Lê o campo de arquivo do formulário (checa o tamanho antes de ler para o disco/memória). */
export async function lerArquivoDoForm(fd: FormData, campo = "arquivo"): Promise<ArquivoValidado> {
  const file = fd.get(campo);
  if (!(file instanceof File) || file.size === 0) throw new ErroNegocio("Selecione um arquivo.");
  if (file.size > MAX_BYTES) throw new ErroNegocio("Arquivo maior que 10 MB.");
  return validarArquivo(Buffer.from(await file.arrayBuffer()), file.name, file.type || undefined);
}
