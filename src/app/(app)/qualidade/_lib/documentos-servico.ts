import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, type Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { ID_SEGURO, NOME_ARQUIVO_SEGURO, type ArquivoValidado } from "@/lib/upload-seguro";
import type { EscopoDocumento, TipoDocumento } from "@/generated/prisma/client";
import { erroDoAlvo, filtroValidade, FILTRO_ATENCAO, mesmoAlvo, SITUACOES, type EscopoDoc, type SituacaoDoc } from "./documentos";

/**
 * Documentos e licenças: tudo que mexe no banco e no disco. Fora de "use server" para ser testado sem login.
 * Documento nunca é apagado (histórico regulatório): só inativa ou é substituído por uma renovação.
 * Arquivos ficam em storage/uploads/documentos/<documentoId>/<uuid>.<ext>, FORA de public/.
 */

/** Documentos que contam para alertas e listas padrão: ativos e que não foram substituídos por uma renovação. */
export const VIGENTES = { ativo: true, substituidoPorId: null } as const;

export type DadosDocumento = {
  tipo: TipoDocumento;
  titulo: string;
  numero: string | null;
  orgaoEmissor: string | null;
  emissao: Date | null;
  validade: Date | null;
  observacao: string | null;
};
export type AlvoInput = { escopo: EscopoDocumento; fornecedorId: string | null; fabricanteId: string | null; produtoId: string | null };

// ───────── armazenamento ─────────

export function pastaDocumento(documentoId: string) {
  return path.join(process.cwd(), "storage", "uploads", "documentos", documentoId);
}

/** Caminho absoluto do arquivo, garantindo que fique dentro da pasta do documento (sem path traversal). */
export function caminhoArquivoDocumento(documentoId: string, caminho: string): string | null {
  if (!ID_SEGURO.test(documentoId)) return null;
  const nome = path.basename(caminho);
  if (nome !== caminho || !NOME_ARQUIVO_SEGURO.test(nome)) return null;
  return path.join(pastaDocumento(documentoId), nome);
}

async function gravarEmDisco(documentoId: string, arq: ArquivoValidado) {
  if (!ID_SEGURO.test(documentoId)) throw new ErroNegocio("Documento inválido.");
  const caminho = `${randomUUID()}.${arq.ext}`;
  const pasta = pastaDocumento(documentoId);
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, caminho), arq.buf, { flag: "wx" });
  return caminho;
}

async function removerDoDisco(documentoId: string, caminho: string) {
  const abs = caminhoArquivoDocumento(documentoId, caminho);
  if (abs) await unlink(abs).catch(() => undefined);
  await rmdir(pastaDocumento(documentoId)).catch(() => undefined); // só remove se ficou vazia
}

// ───────── validações ─────────

function validarDados(d: DadosDocumento) {
  if (!d.titulo.trim()) throw new ErroNegocio("Informe o título do documento.");
  if (d.emissao && d.validade && d.validade < d.emissao) throw new ErroNegocio("A validade não pode ser anterior à emissão.");
}

async function validarAlvo(tx: Tx, a: AlvoInput) {
  const erro = erroDoAlvo(a);
  if (erro) throw new ErroNegocio(erro);
  if (a.fornecedorId && !(await tx.fornecedor.findUnique({ where: { id: a.fornecedorId }, select: { id: true } }))) throw new ErroNegocio("Fornecedor não encontrado.");
  if (a.fabricanteId && !(await tx.fabricante.findUnique({ where: { id: a.fabricanteId }, select: { id: true } }))) throw new ErroNegocio("Fabricante não encontrado.");
  if (a.produtoId && !(await tx.produto.findUnique({ where: { id: a.produtoId }, select: { id: true } }))) throw new ErroNegocio("Produto não encontrado.");
}

async function travar(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Documento" WHERE id = ${id} FOR UPDATE`;
  const doc = await tx.documento.findUnique({ where: { id } });
  if (!doc) throw new ErroNegocio("Documento não encontrado.");
  return doc;
}

async function registrarArquivo(tx: Tx, documentoId: string, caminho: string, arq: ArquivoValidado, usuarioId: string | null) {
  return tx.documentoArquivo.create({
    data: { documentoId, nome: arq.nome, caminho, mime: arq.mime, tamanho: arq.tamanho, hash: arq.hash, criadoPor: usuarioId },
  });
}

// ───────── operações ─────────

/**
 * Cadastra um documento (com arquivo opcional). Com `substituiId`, o documento anterior (mesmo tipo, escopo e vínculo,
 * ainda vigente no cadastro) fica marcado como substituído por este, mantendo o histórico. Tudo numa transação;
 * se ela falhar, o arquivo gravado no disco é removido.
 */
export async function criarDocumento(
  dados: DadosDocumento,
  alvo: AlvoInput,
  opts: { usuarioId: string | null; substituiId?: string | null; arquivo?: ArquivoValidado | null },
) {
  validarDados(dados);
  const id = randomBytes(12).toString("hex");
  const caminho = opts.arquivo ? await gravarEmDisco(id, opts.arquivo) : null;
  try {
    return await db.$transaction(async (tx) => {
      await validarAlvo(tx, alvo);
      const doc = await tx.documento.create({ data: { id, ...dados, ...alvo, criadoPor: opts.usuarioId } });
      if (opts.substituiId) {
        const antigo = await travar(tx, opts.substituiId);
        if (antigo.substituidoPorId) throw new ErroNegocio("O documento escolhido já foi substituído por outro.");
        if (!antigo.ativo) throw new ErroNegocio("O documento escolhido está inativo e não pode ser substituído.");
        if (!mesmoAlvo({ ...antigo }, { ...dados, ...alvo })) throw new ErroNegocio("Só é possível substituir um documento do mesmo tipo e do mesmo vínculo.");
        await tx.documento.update({ where: { id: antigo.id }, data: { substituidoPorId: id, substituidoEm: new Date() } });
      }
      if (opts.arquivo && caminho) await registrarArquivo(tx, id, caminho, opts.arquivo, opts.usuarioId);
      return { ...doc, substituiuId: opts.substituiId ?? null };
    });
  } catch (e) {
    if (caminho) await removerDoDisco(id, caminho);
    throw e;
  }
}

/** Edita dados do documento. Tipo, escopo e vínculo não mudam (a cadeia de renovações depende deles). */
export async function atualizarDocumento(id: string, dados: DadosDocumento) {
  validarDados(dados);
  return db.$transaction(async (tx) => {
    await travar(tx, id);
    return tx.documento.update({ where: { id }, data: { ...dados, tipo: undefined } });
  });
}

/** Inativa/reativa. Um documento substituído não volta a valer (a renovação é quem vale). */
export async function definirAtivo(id: string, ativo: boolean) {
  return db.$transaction(async (tx) => {
    const doc = await travar(tx, id);
    if (ativo && doc.substituidoPorId) throw new ErroNegocio("Documento substituído por uma renovação não pode ser reativado.");
    return tx.documento.update({ where: { id }, data: { ativo } });
  });
}

/** Nova versão do arquivo de um documento (a mais recente é a vigente). */
export async function anexarArquivo(documentoId: string, arq: ArquivoValidado, usuarioId: string | null) {
  if (!ID_SEGURO.test(documentoId) || !(await db.documento.findUnique({ where: { id: documentoId }, select: { id: true } }))) throw new ErroNegocio("Documento não encontrado.");
  const caminho = await gravarEmDisco(documentoId, arq);
  try {
    return await db.$transaction(async (tx) => {
      const doc = await travar(tx, documentoId);
      if (!doc.ativo) throw new ErroNegocio("Reative o documento para enviar um novo arquivo.");
      if (await tx.documentoArquivo.findFirst({ where: { documentoId, hash: arq.hash }, select: { id: true } })) {
        throw new ErroNegocio("Este arquivo já foi enviado neste documento.");
      }
      return registrarArquivo(tx, documentoId, caminho, arq, usuarioId);
    });
  } catch (e) {
    await removerDoDisco(documentoId, caminho);
    throw e;
  }
}

/** Arquivo para download: só se pertencer ao documento informado e o caminho for seguro. */
export async function arquivoParaDownload(documentoId: string, arquivoId: string) {
  const arq = await db.documentoArquivo.findUnique({ where: { id: arquivoId } });
  if (!arq || arq.documentoId !== documentoId) return null;
  const abs = caminhoArquivoDocumento(arq.documentoId, arq.caminho);
  return abs ? { arq, abs } : null;
}

// ───────── consultas ─────────

export type FiltroLista = { escopo?: EscopoDoc; tipo?: TipoDocumento; situacao?: SituacaoDoc | typeof FILTRO_ATENCAO; q?: string; inativos?: boolean };

export function whereLista(f: FiltroLista, hoje: Date) {
  return {
    ...(f.inativos ? {} : VIGENTES),
    ...(f.escopo ? { escopo: f.escopo } : {}),
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.situacao ? filtroValidade(f.situacao, hoje) : {}),
    ...(f.q
      ? {
          OR: [
            { titulo: { contains: f.q, mode: "insensitive" as const } },
            { numero: { contains: f.q, mode: "insensitive" as const } },
            { orgaoEmissor: { contains: f.q, mode: "insensitive" as const } },
            { fornecedor: { OR: [{ razaoSocial: { contains: f.q, mode: "insensitive" as const } }, { nomeFantasia: { contains: f.q, mode: "insensitive" as const } }] } },
            { fabricante: { nome: { contains: f.q, mode: "insensitive" as const } } },
            { produto: { OR: [{ descricao: { contains: f.q, mode: "insensitive" as const } }, { codigo: { contains: f.q, mode: "insensitive" as const } }] } },
          ],
        }
      : {}),
  };
}

/** Contagem por situação entre os documentos vigentes no cadastro (ativos, não substituídos). */
export async function contarPorSituacao(hoje: Date) {
  const r = await Promise.all(SITUACOES.map((s) => db.documento.count({ where: { ...VIGENTES, ...filtroValidade(s, hoje) } })));
  return Object.fromEntries(SITUACOES.map((s, i) => [s, r[i]])) as Record<SituacaoDoc, number>;
}

/** Alertas do sino/painel: vencidos e vencendo em até 30 dias. */
export async function contarAlertas(hoje: Date) {
  const [vencidos, vencendo30] = await Promise.all([
    db.documento.count({ where: { ...VIGENTES, ...filtroValidade("VENCIDO", hoje) } }),
    db.documento.count({ where: { ...VIGENTES, ...filtroValidade("VENCE_EM_30", hoje) } }),
  ]);
  return { vencidos, vencendo30, total: vencidos + vencendo30 };
}

/** Documentos vigentes de um cadastro (fornecedor, fabricante ou produto) para o cartão "Documentos". */
export function documentosDoCadastro(escopo: Exclude<EscopoDoc, "EMPRESA">, id: string) {
  const fk = { FORNECEDOR: "fornecedorId", FABRICANTE: "fabricanteId", PRODUTO: "produtoId" }[escopo];
  return db.documento.findMany({
    where: { ...VIGENTES, escopo, [fk]: id },
    orderBy: [{ validade: { sort: "asc", nulls: "last" } }, { titulo: "asc" }],
    select: { id: true, tipo: true, titulo: true, numero: true, validade: true },
  });
}
