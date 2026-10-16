/** Documentos e licenças: CHECKs do banco, renovação (histórico), versões de arquivo, segurança do arquivo, alertas e pendências. Apaga o que cria (inclusive arquivos no disco). */
import "dotenv/config";
import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { validarArquivo, MAX_BYTES } from "@/lib/upload-seguro";
import { carregarPendencias, listarPendencias } from "@/lib/pendencias";
import { hojeUTC, addDias } from "@/app/(app)/financeiro/_lib/datas";
import {
  anexarArquivo, arquivoParaDownload, caminhoArquivoDocumento, contarAlertas, contarPorSituacao, criarDocumento, definirAtivo, pastaDocumento, atualizarDocumento,
  type AlvoInput, type DadosDocumento,
} from "@/app/(app)/qualidade/_lib/documentos-servico";
import { limparDocumentos, limparTudo, mkFornecedor, mkProduto, P } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const hoje = hojeUTC();
const EMPRESA: AlvoInput = { escopo: "EMPRESA", fornecedorId: null, fabricanteId: null, produtoId: null };
const dados = (o: Partial<DadosDocumento> = {}): DadosDocumento => ({ tipo: "AFE", titulo: `${P} doc`, numero: null, orgaoEmissor: null, emissao: null, validade: null, observacao: null, ...o });
const pdf = (conteudo = "teste") => validarArquivo(Buffer.from(`%PDF-1.4\n${conteudo}\n%%EOF`), "Licença Sanitária 2026.pdf", "application/pdf");
const existe = (p: string) => access(p).then(() => true, () => false);
const rejeita = (f: () => Promise<unknown>, re?: RegExp) => assert.rejects(f, (e) => (re ? re.test((e as Error).message) : true));

test("CHECKs: escopo exige exatamente a FK correspondente; datas; auto-substituição", async () => {
  const f = await mkFornecedor();
  const p = await mkProduto();
  const base = { tipo: "AFE" as const, titulo: `${P} chk` };
  await rejeita(() => db.documento.create({ data: { id: "c1", ...base, escopo: "EMPRESA", fornecedorId: f.id } }), /Documento_escopo_check/);
  await rejeita(() => db.documento.create({ data: { id: "c2", ...base, escopo: "FORNECEDOR" } }), /Documento_escopo_check/);
  await rejeita(() => db.documento.create({ data: { id: "c3", ...base, escopo: "FORNECEDOR", fornecedorId: f.id, produtoId: p.id } }), /Documento_escopo_check/);
  await rejeita(() => db.documento.create({ data: { id: "c4", ...base, escopo: "PRODUTO", fornecedorId: f.id } }), /Documento_escopo_check/);
  await rejeita(() => db.documento.create({ data: { id: "c5", ...base, titulo: "   ", escopo: "EMPRESA" } }), /Documento_titulo_check/);
  await rejeita(() => db.documento.create({ data: { id: "c6", ...base, escopo: "EMPRESA", emissao: addDias(hoje, 5), validade: hoje } }), /Documento_datas_check/);
  const ok = await db.documento.create({ data: { id: "c7", ...base, escopo: "FORNECEDOR", fornecedorId: f.id } });
  await rejeita(() => db.documento.update({ where: { id: ok.id }, data: { substituidoPorId: ok.id, substituidoEm: new Date() } }), /Documento_substitui_si_check/);
  await rejeita(() => db.documento.update({ where: { id: ok.id }, data: { substituidoEm: new Date() } }), /Documento_substituido_check/);
});

test("CHECKs do arquivo: tamanho, hash, mime e caminho", async () => {
  const d = await criarDocumento(dados({ titulo: `${P} chk arq` }), EMPRESA, { usuarioId: null });
  const base = { documentoId: d.id, nome: "a.pdf", caminho: "11111111-1111-1111-1111-111111111111.pdf", mime: "application/pdf", tamanho: 10, hash: "a".repeat(64) };
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, tamanho: 0 } }), /tamanho_check/);
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, tamanho: MAX_BYTES + 1 } }), /tamanho_check/);
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, hash: "xyz" } }), /hash_check/);
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, mime: "text/html" } }), /mime_check/);
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, caminho: "../../etc/passwd" } }), /caminho_check/);
  await rejeita(() => db.documentoArquivo.create({ data: { ...base, caminho: "11111111-1111-1111-1111-111111111111.exe" } }), /caminho_check/);
  await db.documentoArquivo.create({ data: base });
});

test("criar com arquivo grava no disco (UUID, fora de public) e registra hash, mime e tamanho", async () => {
  const arq = pdf("conteudo A");
  const d = await criarDocumento(dados({ titulo: `${P} com arquivo`, numero: "123" }), EMPRESA, { usuarioId: null, arquivo: arq });
  const [a] = await db.documentoArquivo.findMany({ where: { documentoId: d.id } });
  assert.equal(a.mime, "application/pdf");
  assert.equal(a.tamanho, arq.tamanho);
  assert.equal(a.hash, arq.hash);
  assert.match(a.caminho, /^[a-f0-9-]{36}\.pdf$/);
  assert.equal(a.nome, "Licença Sanitária 2026.pdf");
  const abs = caminhoArquivoDocumento(d.id, a.caminho)!;
  assert.ok(abs.includes("/storage/uploads/documentos/") && !abs.includes("/public/"));
  assert.ok(await existe(abs));
});

test("validação do arquivo: tipo falso, texto, vazio e acima de 10 MB são recusados", () => {
  assert.throws(() => validarArquivo(Buffer.from("<html>oi</html>"), "x.pdf", "application/pdf"), ErroNegocio);
  assert.throws(() => validarArquivo(Buffer.from("%PDF-1.4 ok"), "x.pdf", "text/html"), /não permitido/);
  assert.throws(() => validarArquivo(Buffer.alloc(0), "x.pdf"), /Selecione/);
  assert.throws(() => validarArquivo(Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(MAX_BYTES)]), "x.pdf"), /10 MB/);
  const png = validarArquivo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), "../../foto.png", "image/png");
  assert.equal(png.ext, "png");
  assert.equal(png.nome, "foto.png", "nome sem caminho");
});

test("falha na transação remove o arquivo gravado (fornecedor inexistente)", async () => {
  const antes = await readdir(pastaDocumento("x").replace(/x$/, "")).catch(() => [] as string[]);
  await rejeita(() => criarDocumento(dados({ titulo: `${P} falha` }), { escopo: "FORNECEDOR", fornecedorId: "nao-existe", fabricanteId: null, produtoId: null }, { usuarioId: null, arquivo: pdf("falha") }), /Fornecedor não encontrado/);
  const depois = await readdir(pastaDocumento("x").replace(/x$/, "")).catch(() => [] as string[]);
  assert.deepEqual(depois.sort(), antes.sort(), "nenhuma pasta órfã");
  assert.equal(await db.documento.count({ where: { titulo: `${P} falha` } }), 0);
});

test("renovação: o anterior fica substituído, com histórico, e não gera mais alerta", async () => {
  const f = await mkFornecedor();
  const alvo: AlvoInput = { escopo: "FORNECEDOR", fornecedorId: f.id, fabricanteId: null, produtoId: null };
  const a = await criarDocumento(dados({ titulo: `${P} afe v1`, validade: addDias(hoje, -10) }), alvo, { usuarioId: null, arquivo: pdf("v1") });
  const antes = await contarAlertas(hoje);
  const b = await criarDocumento(dados({ titulo: `${P} afe v2`, validade: addDias(hoje, 365) }), alvo, { usuarioId: null, substituiId: a.id, arquivo: pdf("v2") });
  const a2 = await db.documento.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(a2.substituidoPorId, b.id);
  assert.ok(a2.substituidoEm);
  assert.equal(a2.ativo, true, "histórico preservado, não apagado");
  assert.equal(await db.documentoArquivo.count({ where: { documentoId: a.id } }), 1, "arquivos do antigo ficam");
  assert.equal((await contarAlertas(hoje)).vencidos, antes.vencidos - 1, "substituído sai dos alertas");

  await rejeita(() => criarDocumento(dados({ titulo: `${P} afe v3` }), alvo, { usuarioId: null, substituiId: a.id }), /já foi substituído/);
  assert.equal(await db.documento.count({ where: { titulo: `${P} afe v3` } }), 0, "rollback: novo documento não ficou");
  await rejeita(() => definirAtivo(a.id, true).then(() => definirAtivo(a.id, false)).then(() => definirAtivo(a.id, true)), /substituído/);
});

test("renovação recusa outro tipo, outro vínculo e documento inativo", async () => {
  const f1 = await mkFornecedor();
  const f2 = await mkFornecedor();
  const alvo1: AlvoInput = { escopo: "FORNECEDOR", fornecedorId: f1.id, fabricanteId: null, produtoId: null };
  const a = await criarDocumento(dados({ titulo: `${P} ren x` }), alvo1, { usuarioId: null });
  await rejeita(() => criarDocumento(dados({ titulo: `${P} ren x2`, tipo: "LAUDO" }), alvo1, { usuarioId: null, substituiId: a.id }), /mesmo tipo/);
  await rejeita(() => criarDocumento(dados({ titulo: `${P} ren x3` }), { ...alvo1, fornecedorId: f2.id }, { usuarioId: null, substituiId: a.id }), /mesmo tipo/);
  await definirAtivo(a.id, false);
  await rejeita(() => criarDocumento(dados({ titulo: `${P} ren x4` }), alvo1, { usuarioId: null, substituiId: a.id }), /inativo/);
  assert.equal((await db.documento.findUniqueOrThrow({ where: { id: a.id } })).substituidoPorId, null);
});

test("duas renovações simultâneas do mesmo documento: só uma passa", async () => {
  const f = await mkFornecedor();
  const alvo: AlvoInput = { escopo: "FORNECEDOR", fornecedorId: f.id, fabricanteId: null, produtoId: null };
  const a = await criarDocumento(dados({ titulo: `${P} corrida` }), alvo, { usuarioId: null });
  const r = await Promise.allSettled([1, 2, 3].map((n) => criarDocumento(dados({ titulo: `${P} corrida ${n}` }), alvo, { usuarioId: null, substituiId: a.id })));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.documento.count({ where: { titulo: { startsWith: `${P} corrida ` } } }), 1);
});

test("versões de arquivo: a mais recente é a vigente; mesmo conteúdo e documento inativo são recusados", async () => {
  const d = await criarDocumento(dados({ titulo: `${P} versoes` }), EMPRESA, { usuarioId: null, arquivo: pdf("um") });
  await new Promise((r) => setTimeout(r, 5));
  await anexarArquivo(d.id, pdf("dois"), null);
  const lista = await db.documentoArquivo.findMany({ where: { documentoId: d.id }, orderBy: { criadoEm: "desc" } });
  assert.equal(lista.length, 2);
  assert.equal(lista[0].hash, pdf("dois").hash);
  await rejeita(() => anexarArquivo(d.id, pdf("dois"), null), /já foi enviado/);
  assert.equal(await db.documentoArquivo.count({ where: { documentoId: d.id } }), 2);
  assert.equal((await readdir(pastaDocumento(d.id))).length, 2, "o arquivo recusado não ficou no disco");
  await definirAtivo(d.id, false);
  await rejeita(() => anexarArquivo(d.id, pdf("tres"), null), /Reative/);
  await rejeita(() => anexarArquivo("nao-existe", pdf("x"), null), /não encontrado/);
  await rejeita(() => anexarArquivo("../../etc", pdf("x"), null), /não encontrado/);
});

test("download: só entrega arquivo que pertence ao documento; caminho nunca sai da pasta", async () => {
  const a = await criarDocumento(dados({ titulo: `${P} dl a` }), EMPRESA, { usuarioId: null, arquivo: pdf("dl a") });
  const b = await criarDocumento(dados({ titulo: `${P} dl b` }), EMPRESA, { usuarioId: null, arquivo: pdf("dl b") });
  const arqA = await db.documentoArquivo.findFirstOrThrow({ where: { documentoId: a.id } });
  assert.ok(await arquivoParaDownload(a.id, arqA.id));
  assert.equal(await arquivoParaDownload(b.id, arqA.id), null, "arquivo de A pedido pela URL de B");
  assert.equal(await arquivoParaDownload(a.id, "inexistente"), null);
  assert.equal(caminhoArquivoDocumento(a.id, "../x.pdf"), null);
  assert.equal(caminhoArquivoDocumento(a.id, "/etc/passwd"), null);
  assert.equal(caminhoArquivoDocumento("../" + a.id, arqA.caminho), null);
  assert.equal(caminhoArquivoDocumento(a.id, "x.php"), null);
});

test("edição não altera tipo; datas inconsistentes são recusadas; documento com vínculo não pode ser apagado", async () => {
  const f = await mkFornecedor();
  const d = await criarDocumento(dados({ titulo: `${P} edit`, tipo: "CERTIFICADO_BPF" }), { escopo: "FORNECEDOR", fornecedorId: f.id, fabricanteId: null, produtoId: null }, { usuarioId: null });
  const e = await atualizarDocumento(d.id, dados({ titulo: `${P} edit 2`, tipo: "LAUDO", numero: "9", validade: addDias(hoje, 20) }));
  assert.equal(e.tipo, "CERTIFICADO_BPF");
  assert.equal(e.titulo, `${P} edit 2`);
  await rejeita(() => atualizarDocumento(d.id, dados({ titulo: `${P} x`, emissao: addDias(hoje, 2), validade: hoje })), /anterior à emissão/);
  await rejeita(() => atualizarDocumento(d.id, dados({ titulo: "  " })), /título/);
  await rejeita(() => db.fornecedor.delete({ where: { id: f.id } }));
});

test("alertas e pendências: vencidos + até 30 dias, só vigentes; por perfil", async () => {
  const antes = await contarAlertas(hoje);
  const sitAntes = await contarPorSituacao(hoje);
  const pAntes = { qua: await carregarPendencias("QUALIDADE"), com: await carregarPendencias("COMPRAS"), adm: await carregarPendencias("ADMIN"), cml: await carregarPendencias("COMERCIAL"), fin: await carregarPendencias("FINANCEIRO") };
  const mk = (t: string, validade: Date | null, extra: Partial<DadosDocumento> = {}) => criarDocumento(dados({ titulo: `${P} alerta ${t}`, validade, ...extra }), EMPRESA, { usuarioId: null });
  await mk("vencido", addDias(hoje, -1));
  await mk("hoje", hoje);
  await mk("30", addDias(hoje, 30));
  await mk("31", addDias(hoje, 31));
  await mk("91", addDias(hoje, 91));
  await mk("sem", null);
  const inativo = await mk("inativo", addDias(hoje, -5));
  await definirAtivo(inativo.id, false);

  const depois = await contarAlertas(hoje);
  assert.equal(depois.vencidos, antes.vencidos + 1);
  assert.equal(depois.vencendo30, antes.vencendo30 + 2);
  const sit = await contarPorSituacao(hoje);
  assert.equal(sit.VENCE_EM_90, sitAntes.VENCE_EM_90 + 1);
  assert.equal(sit.VIGENTE, sitAntes.VIGENTE + 1);
  assert.equal(sit.SEM_VENCIMENTO, sitAntes.SEM_VENCIMENTO + 1);

  for (const [k, perfil] of [["qua", "QUALIDADE"], ["com", "COMPRAS"], ["adm", "ADMIN"]] as const) {
    const d = await carregarPendencias(perfil);
    assert.equal(d.documentos.total, pAntes[k].documentos.total + 3, perfil);
    const item = listarPendencias(d).find((p) => p.key === "doc");
    assert.ok(item && item.href === "/qualidade/documentos?situacao=ATENCAO" && item.tom === "danger", perfil);
  }
  for (const perfil of ["COMERCIAL", "FINANCEIRO"] as const) {
    const d = await carregarPendencias(perfil);
    assert.equal(d.documentos.total, 0, `${perfil} não vê o bloco`);
    assert.ok(!listarPendencias(d).some((p) => p.key === "doc"));
  }
  void pAntes.cml; void pAntes.fin;
});

test("limpeza remove documentos e arquivos de teste", async () => {
  await limparDocumentos();
  assert.equal(await db.documento.count({ where: { titulo: { startsWith: P } } }), 0);
  assert.equal(await db.documentoArquivo.count({ where: { documento: { titulo: { startsWith: P } } } }), 0);
});
