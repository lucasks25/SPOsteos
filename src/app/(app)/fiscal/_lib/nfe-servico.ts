import "server-only";
import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { diaBrasilia } from "@/lib/datas";
import { toNumber } from "@/lib/format";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/publico";
import { montarNfe, type Nfe } from "./nfe";
import { REGRAS, destinoOperacao, enquadramentoDoNcm, type Operacao } from "./nfe-regras";
import { lerOrigem, type Complemento, type Origem } from "./nfe-origens";
import { referenciaDaNota, type Emissor, type RetornoEmissor } from "./emissor";

/**
 * Ciclo da NF-e (docs/NFE.md §6). A chamada ao emissor (HTTP) NUNCA acontece dentro de transação do banco:
 *   1. criarRascunhoTx      lê a origem, monta e grava a FOTO da nota (RASCUNHO).
 *   2. enviarNota           tx curta: RASCUNHO → ENVIADA com a referência gravada ANTES do envio; depois chama o emissor.
 *   3. aplicarRetorno       tx curta: ENVIADA → AUTORIZADA | REJEITADA (PROCESSANDO continua ENVIADA; "Consultar" repete).
 *   4. aplicarEfeito        tx separada: reflexo na origem (venda: pedido FATURADO com o número da NF + conta a receber,
 *                           pela API pública do comercial). Se falhar (mês fechado, número já usado), a nota CONTINUA
 *                           autorizada e fica com `efeitoPendente`; "Aplicar na origem" refaz.
 * Se o processo cair entre o envio e a gravação do retorno, a nota fica ENVIADA com a referência: a consulta recupera.
 */

const TX = { timeout: 30_000, maxWait: 10_000 };

async function evento(tx: Tx, notaId: number, tipo: Parameters<Tx["notaFiscalEvento"]["create"]>[0]["data"]["tipo"], sucesso: boolean, dados: { texto?: string | null; protocolo?: string | null; sequencia?: number | null; usuarioId?: string | null } = {}) {
  await tx.notaFiscalEvento.create({ data: { notaId, tipo, sucesso, texto: dados.texto?.slice(0, 2000) ?? null, protocolo: dados.protocolo ?? null, sequencia: dados.sequencia ?? null, usuarioId: dados.usuarioId ?? null } });
}

async function travarNota(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "NotaFiscal" WHERE id = ${id} FOR UPDATE`;
  const n = await tx.notaFiscal.findUnique({ where: { id }, include: { itens: { orderBy: { numeroItem: "asc" } } } });
  if (!n) throw new ErroNegocio("Nota fiscal não encontrada.");
  return n;
}

export type ResultadoMontagem = { notaId: number; avisos: string[] };

/** Lê a origem, monta e grava a nota em RASCUNHO. Recusa se houver erro de montagem ou outra nota ativa da mesma origem e tipo. */
export async function criarRascunhoTx(tx: Tx, origem: Origem, op: Operacao, comp: Complemento, usuarioId: string | null, emissor: Pick<Emissor, "provedor" | "ambiente">, agora = new Date()): Promise<ResultadoMontagem> {
  const lida = await lerOrigem(tx, origem, op, comp, agora);
  const { nfe, erros, avisos } = montarNfe(lida.entrada);
  if (erros.length) throw new ErroNegocio(`A nota não pode ser montada: ${erros.join(" ")}`);
  const v = lida.vinculo;
  const ativa = await tx.notaFiscal.findFirst({
    where: { tipo: op, status: { notIn: ["REJEITADA", "CANCELADA"] }, pedidoVendaId: v.pedidoVendaId, remessaId: v.remessaId, pedidoCompraId: v.pedidoCompraId },
    select: { id: true, status: true },
  });
  if (ativa) throw new ErroNegocio(`Já existe a nota NF-${ativa.id} (${ativa.status.toLowerCase()}) para ${lida.descricaoOrigem}. Abra-a em vez de criar outra.`);
  const t = nfe.totais;
  const d = nfe.destinatario;
  const nota = await tx.notaFiscal.create({
    data: {
      tipo: op,
      entrada: nfe.entrada,
      naturezaOperacao: nfe.natureza,
      cfop: nfe.cfop,
      provedor: emissor.provedor,
      ambiente: emissor.ambiente,
      referencia: `rascunho-${randomUUID()}`,
      destNome: d.nome,
      destDocumento: d.documento,
      destIe: d.ie,
      destEndereco: d.endereco,
      destBairro: d.bairro,
      destCep: d.cep,
      destMunicipio: d.municipio,
      destUf: d.uf,
      destPais: d.pais,
      ...v,
      valorProdutos: t.produtos,
      valorFrete: t.frete,
      valorSeguro: t.seguro,
      valorOutros: t.outros,
      valorII: t.ii,
      valorIpi: t.ipi,
      valorIcms: t.icms,
      valorPis: t.pis,
      valorCofins: t.cofins,
      valorTotal: t.total,
      chavesReferenciadas: nfe.chavesReferenciadas,
      informacoesComplementares: nfe.informacoes,
      importacao: nfe.importacao ? JSON.parse(JSON.stringify(nfe.importacao)) : undefined,
      vencimento: lida.vencimento,
      criadoPor: usuarioId,
      itens: {
        create: nfe.itens.map((i) => ({
          numeroItem: i.numeroItem,
          produtoId: i.produtoId,
          codigo: i.codigo,
          descricao: i.descricao,
          ncm: i.ncm,
          cest: i.cest,
          gtin: i.gtin,
          cfop: i.cfop,
          unidade: i.unidade,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal,
          origem: i.origem,
          cstIcms: i.cst.icms,
          aliquotaIcms: i.cst.aliqIcms,
          baseIcms: i.baseIcms,
          valorIcms: i.valorIcms,
          cstIpi: i.cst.ipi,
          aliquotaIpi: i.cst.aliqIpi,
          valorIpi: i.valorIpi,
          cstPis: i.cst.pis,
          aliquotaPis: i.cst.aliqPis,
          valorPis: i.valorPis,
          cstCofins: i.cst.cofins,
          aliquotaCofins: i.cst.aliqCofins,
          valorCofins: i.valorCofins,
          valorII: i.valorII,
          loteNumero: i.lote?.numero ?? null,
          loteFabricacao: i.lote?.fabricacao ?? null,
          loteValidade: i.lote?.validade ?? null,
          registroAnvisa: i.registroAnvisa,
        })),
      },
    },
  });
  await tx.notaFiscal.update({ where: { id: nota.id }, data: { referencia: referenciaDaNota(nota.id, 1) } });
  await evento(tx, nota.id, "MONTAGEM", true, { texto: avisos.length ? `Avisos: ${avisos.join(" ")}` : `Montada a partir de ${lida.descricaoOrigem}.`, usuarioId });
  return { notaId: nota.id, avisos };
}

type NotaComItens = Awaited<ReturnType<typeof travarNota>>;

/** Reconstrói a NF-e a partir da foto gravada (é ela que vai ao emissor, não a origem relida). */
export function notaParaNfe(n: NotaComItens): Nfe {
  const op = n.tipo as Operacao;
  const r = REGRAS[op];
  const indIEDest: 1 | 2 | 9 = op === "IMPORTACAO" ? 9 : n.destIe ? 1 : 9;
  const nfe: Nfe = {
    operacao: op,
    entrada: n.entrada,
    natureza: n.naturezaOperacao,
    cfop: n.cfop,
    finalidade: r.finalidade,
    idDest: destinoOperacao(op, n.destUf),
    indFinal: r.entrada ? 0 : 1,
    indIEDest,
    destinatario: { nome: n.destNome, documento: n.destDocumento, ie: n.destIe, endereco: n.destEndereco, bairro: n.destBairro, cep: n.destCep, municipio: n.destMunicipio, uf: n.destUf, pais: n.destPais },
    itens: n.itens.map((i) => ({
      numeroItem: i.numeroItem,
      produtoId: i.produtoId,
      codigo: i.codigo,
      descricao: i.descricao,
      ncm: i.ncm,
      cest: i.cest,
      gtin: i.gtin,
      cfop: i.cfop,
      unidade: i.unidade,
      quantidade: i.quantidade,
      valorUnitario: toNumber(i.valorUnitario),
      valorTotal: toNumber(i.valorTotal),
      origem: i.origem,
      cst: { icms: i.cstIcms, ipi: i.cstIpi, pis: i.cstPis, cofins: i.cstCofins, aliqIcms: toNumber(i.aliquotaIcms), aliqIpi: toNumber(i.aliquotaIpi), aliqPis: toNumber(i.aliquotaPis), aliqCofins: toNumber(i.aliquotaCofins) },
      cBenef: i.cstIcms === "40" ? enquadramentoDoNcm(i.ncm).e.cBenef : null,
      baseIcms: toNumber(i.baseIcms),
      valorIcms: toNumber(i.valorIcms),
      valorIpi: toNumber(i.valorIpi),
      valorPis: toNumber(i.valorPis),
      valorCofins: toNumber(i.valorCofins),
      valorII: toNumber(i.valorII),
      frete: 0,
      seguro: 0,
      outros: 0,
      lote: i.loteNumero ? { numero: i.loteNumero, fabricacao: i.loteFabricacao, validade: i.loteValidade } : null,
      registroAnvisa: i.registroAnvisa,
    })),
    totais: {
      produtos: toNumber(n.valorProdutos),
      frete: toNumber(n.valorFrete),
      seguro: toNumber(n.valorSeguro),
      outros: toNumber(n.valorOutros),
      ii: toNumber(n.valorII),
      ipi: toNumber(n.valorIpi),
      baseIcms: n.itens.reduce((a, i) => a + toNumber(i.baseIcms), 0),
      icms: toNumber(n.valorIcms),
      pis: toNumber(n.valorPis),
      cofins: toNumber(n.valorCofins),
      total: toNumber(n.valorTotal),
    },
    chavesReferenciadas: n.chavesReferenciadas,
    importacao: n.importacao ? (JSON.parse(JSON.stringify(n.importacao), (k, val) => (/^data/.test(k) && typeof val === "string" ? new Date(val) : val)) as Nfe["importacao"]) : null,
    informacoes: n.informacoesComplementares,
  };
  return nfe;
}

/** Envia a nota em RASCUNHO. Devolve o status final conhecido. */
export async function enviarNota(id: number, usuarioId: string | null, emissor: Emissor): Promise<string> {
  const { referencia, nfe } = await db.$transaction(async (tx) => {
    const n = await travarNota(tx, id);
    if (n.status !== "RASCUNHO") throw new ErroNegocio(`A nota NF-${id} está ${n.status.toLowerCase()}; só rascunho é enviado.`);
    if (n.provedor !== emissor.provedor || n.ambiente !== emissor.ambiente)
      throw new ErroNegocio(`A nota foi montada para ${n.provedor}/${n.ambiente} e o emissor configurado agora é ${emissor.provedor}/${emissor.ambiente}. Descarte-a e monte outra.`);
    const tentativa = await tx.notaFiscalEvento.count({ where: { notaId: id, tipo: "ENVIO" } });
    const ref = referenciaDaNota(id, tentativa + 1);
    await tx.notaFiscal.update({ where: { id }, data: { status: "ENVIADA", referencia: ref, enviadaEm: new Date(), mensagem: null } });
    await evento(tx, id, "ENVIO", true, { texto: `Enviada ao emissor ${emissor.provedor} (${emissor.ambiente}), referência ${ref}.`, usuarioId });
    return { referencia: ref, nfe: notaParaNfe(n) };
  }, TX);
  let ret: RetornoEmissor;
  try {
    ret = await emissor.emitir(referencia, nfe);
  } catch (e) {
    await db.$transaction((tx) => evento(tx, id, "ERRO", false, { texto: `Falha de comunicação ao enviar: ${e instanceof Error ? e.message : String(e)}. Use "Consultar".`, usuarioId }));
    return "ENVIADA";
  }
  return aplicarRetorno(id, ret, usuarioId);
}

/** Consulta no emissor a nota ENVIADA (processamento assíncrono ou queda no meio do envio). */
export async function consultarNota(id: number, usuarioId: string | null, emissor: Emissor): Promise<string> {
  const n = await db.notaFiscal.findUnique({ where: { id }, select: { status: true, referencia: true } });
  if (!n) throw new ErroNegocio("Nota fiscal não encontrada.");
  if (n.status !== "ENVIADA") throw new ErroNegocio("Só nota enviada (aguardando a SEFAZ) é consultada.");
  let ret: RetornoEmissor;
  try {
    ret = await emissor.consultar(n.referencia);
  } catch (e) {
    throw new ErroNegocio(`Emissor indisponível: ${e instanceof Error ? e.message : String(e)}. Tente de novo em instantes.`);
  }
  return aplicarRetorno(id, ret, usuarioId);
}

/** Grava o retorno do emissor. Idempotente: só age sobre nota ENVIADA. */
export async function aplicarRetorno(id: number, ret: RetornoEmissor, usuarioId: string | null): Promise<string> {
  const status = await db.$transaction(async (tx) => {
    const n = await travarNota(tx, id);
    if (n.status !== "ENVIADA") return n.status;
    if (ret.situacao === "AUTORIZADA") {
      if (!ret.chave || !ret.protocolo || !ret.numero) throw new Error(`Retorno AUTORIZADA sem chave/protocolo/número (nota ${id}).`);
      await tx.notaFiscal.update({
        where: { id },
        data: { status: "AUTORIZADA", chave: ret.chave, protocolo: ret.protocolo, numero: ret.numero, serie: ret.serie ?? null, xmlUrl: ret.xmlUrl ?? null, danfeUrl: ret.danfeUrl ?? null, mensagem: ret.mensagem ?? null, autorizadaEm: new Date() },
      });
      await evento(tx, id, "AUTORIZACAO", true, { protocolo: ret.protocolo, texto: `Autorizada: número ${ret.numero}, série ${ret.serie ?? "—"}. ${ret.mensagem ?? ""}`.trim(), usuarioId });
      return "AUTORIZADA";
    }
    if (ret.situacao === "REJEITADA") {
      await tx.notaFiscal.update({ where: { id }, data: { status: "REJEITADA", mensagem: ret.mensagem?.slice(0, 2000) ?? "Rejeitada" } });
      await evento(tx, id, "REJEICAO", false, { texto: ret.mensagem ?? "Rejeitada", usuarioId });
      return "REJEITADA";
    }
    if (ret.situacao === "NAO_ENCONTRADA") {
      // o emissor não recebeu: volta a rascunho e o próximo envio usa referência nova
      await tx.notaFiscal.update({ where: { id }, data: { status: "RASCUNHO", mensagem: ret.mensagem ?? "Não encontrada no emissor" } });
      await evento(tx, id, "CONSULTA", false, { texto: `Não encontrada no emissor; voltou a rascunho. ${ret.mensagem ?? ""}`.trim(), usuarioId });
      return "RASCUNHO";
    }
    await evento(tx, id, "CONSULTA", true, { texto: ret.mensagem ?? `Situação no emissor: ${ret.situacao.toLowerCase()}`, usuarioId });
    return "ENVIADA";
  }, TX);
  if (status === "AUTORIZADA") await aplicarEfeito(id, usuarioId);
  return status;
}

/** Número que vai para o pedido: em teste, com prefixo, para ninguém confundir com NF de verdade. */
export function numeroParaPedido(n: { numero: number | null; serie: number | null; ambiente: string }) {
  const base = String(n.numero);
  return n.ambiente === "PRODUCAO" ? base : `${n.ambiente === "SIMULADO" ? "SIM" : "HOM"}-${base}`;
}

/**
 * Reflexo da nota autorizada na origem. Venda: `registrarNfTx` do comercial (pedido FATURADO com o número da NF e conta a
 * receber com vencimento = hoje + prazo do hospital; aplica mês fechado e trava de NF duplicada). Demais tipos: nada a refletir.
 * Falha não desfaz a autorização: grava `efeitoPendente` e devolve false.
 */
export async function aplicarEfeito(id: number, usuarioId: string | null, agora = new Date()): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      const n = await travarNota(tx, id);
      if (n.status !== "AUTORIZADA") throw new ErroNegocio("Só nota autorizada é aplicada na origem.");
      if (n.efeitoAplicadoEm) return;
      const venda = REGRAS[n.tipo as Operacao].venda;
      let texto = "Sem reflexo na origem para este tipo de nota.";
      if (venda && n.pedidoVendaId) {
        const h = await tx.hospital.findUnique({ where: { id: n.hospitalId! }, select: { prazoPagamentoDias: true } });
        const venc = new Date(diaBrasilia(agora).getTime() + (h?.prazoPagamentoDias ?? 30) * 86_400_000);
        const numeroNf = numeroParaPedido(n);
        try {
          await registrarNfTx(tx, n.pedidoVendaId, numeroNf, venc, agora);
        } catch (e) {
          if ((e as { code?: string } | null)?.code === "P2002") throw new ErroNegocio(`O número ${numeroNf} já está em outro pedido de venda ativo.`);
          throw e;
        }
        texto = `Pedido PV-${n.pedidoVendaId} faturado com a NF ${numeroNf}; conta a receber com vencimento ${venc.toISOString().slice(0, 10)}.`;
      }
      await tx.notaFiscal.update({ where: { id }, data: { efeitoAplicadoEm: agora, efeitoPendente: null } });
      await evento(tx, id, "EFEITO", true, { texto, usuarioId });
    }, TX);
    return true;
  } catch (e) {
    const msg = e instanceof ErroNegocio ? e.message : "Erro inesperado ao aplicar na origem (veja o log do servidor).";
    if (!(e instanceof ErroNegocio)) console.error(`[nfe ${id}] aplicarEfeito`, e);
    await db.$transaction(async (tx) => {
      await tx.notaFiscal.update({ where: { id }, data: { efeitoPendente: msg.slice(0, 1000) } });
      await evento(tx, id, "EFEITO", false, { texto: msg, usuarioId });
    });
    return false;
  }
}

export const JUSTIFICATIVA_MIN = 15;
export const JUSTIFICATIVA_MAX = 255;
export const CCE_MIN = 15;
export const CCE_MAX = 1000;
export const CCE_LIMITE = 20;

/**
 * Cancela a nota autorizada no emissor. Venda já refletida no pedido é recusada: desfazer o faturamento (pedido de volta a
 * ABERTO e cancelamento da conta a receber) não tem API pública ainda (docs/INTEGRACAO-SETORES.md G8; docs/NFE.md §8).
 */
export async function cancelarNota(id: number, justificativa: string, usuarioId: string | null, emissor: Emissor): Promise<void> {
  justificativa = justificativa.trim();
  if (justificativa.length < JUSTIFICATIVA_MIN || justificativa.length > JUSTIFICATIVA_MAX) throw new ErroNegocio(`A justificativa deve ter de ${JUSTIFICATIVA_MIN} a ${JUSTIFICATIVA_MAX} caracteres.`);
  const n = await db.notaFiscal.findUnique({ where: { id }, select: { status: true, referencia: true, tipo: true, efeitoAplicadoEm: true, pedidoVendaId: true, provedor: true } });
  if (!n) throw new ErroNegocio("Nota fiscal não encontrada.");
  if (n.status !== "AUTORIZADA") throw new ErroNegocio("Só nota autorizada pode ser cancelada.");
  if (n.provedor !== emissor.provedor) throw new ErroNegocio(`A nota foi emitida por ${n.provedor}; o emissor configurado é ${emissor.provedor}.`);
  if (REGRAS[n.tipo as Operacao].venda && n.efeitoAplicadoEm)
    throw new ErroNegocio(`A venda já foi faturada no pedido PV-${n.pedidoVendaId} e gerou conta a receber. O sistema ainda não desfaz esse faturamento: cancele no emissor só depois de combinar o estorno com o Financeiro (docs/NFE.md §8).`);
  const r = await emissor.cancelar(n.referencia, justificativa);
  await db.$transaction(async (tx) => {
    if (r.ok) {
      const u = await tx.notaFiscal.updateMany({ where: { id, status: "AUTORIZADA" }, data: { status: "CANCELADA", canceladaEm: new Date() } });
      if (u.count === 0) return;
    }
    await evento(tx, id, r.ok ? "CANCELAMENTO" : "ERRO", r.ok, { protocolo: r.protocolo, texto: r.ok ? `Cancelada: ${justificativa}` : `Cancelamento recusado: ${r.mensagem ?? ""}`, usuarioId });
  });
  if (!r.ok) throw new ErroNegocio(`O emissor recusou o cancelamento: ${r.mensagem ?? "sem detalhe"}`);
}

/** Carta de correção (CC-e). Não corrige valores, quantidades, tributos, CNPJ/CPF do destinatário nem data (Ajuste SINIEF 07/05, cl. 14-A). */
export async function cartaCorrecaoNota(id: number, texto: string, usuarioId: string | null, emissor: Emissor): Promise<number> {
  texto = texto.replace(/\s+/g, " ").trim();
  if (texto.length < CCE_MIN || texto.length > CCE_MAX) throw new ErroNegocio(`A correção deve ter de ${CCE_MIN} a ${CCE_MAX} caracteres.`);
  const n = await db.notaFiscal.findUnique({ where: { id }, select: { status: true, referencia: true, provedor: true, _count: { select: { eventos: { where: { tipo: "CARTA_CORRECAO", sucesso: true } } } } } });
  if (!n) throw new ErroNegocio("Nota fiscal não encontrada.");
  if (n.status !== "AUTORIZADA") throw new ErroNegocio("Carta de correção só para nota autorizada.");
  if (n.provedor !== emissor.provedor) throw new ErroNegocio(`A nota foi emitida por ${n.provedor}; o emissor configurado é ${emissor.provedor}.`);
  if (n._count.eventos >= CCE_LIMITE) throw new ErroNegocio(`Limite de ${CCE_LIMITE} cartas de correção por nota.`);
  const r = await emissor.cartaCorrecao(n.referencia, texto);
  const seq = r.sequencia ?? n._count.eventos + 1;
  await db.$transaction((tx) => evento(tx, id, r.ok ? "CARTA_CORRECAO" : "ERRO", r.ok, { protocolo: r.protocolo, sequencia: r.ok ? seq : null, texto: r.ok ? texto : `Carta de correção recusada: ${r.mensagem ?? ""}`, usuarioId }));
  if (!r.ok) throw new ErroNegocio(`O emissor recusou a carta de correção: ${r.mensagem ?? "sem detalhe"}`);
  return seq;
}

/** Descarta um rascunho (não enviado): vira REJEITADA com o motivo, libera a origem para nova montagem. */
export async function descartarRascunhoTx(tx: Tx, id: number, usuarioId: string | null) {
  const n = await travarNota(tx, id);
  if (n.status !== "RASCUNHO") throw new ErroNegocio("Só rascunho pode ser descartado.");
  await tx.notaFiscal.update({ where: { id }, data: { status: "REJEITADA", mensagem: "Rascunho descartado pelo usuário (não enviado)." } });
  await evento(tx, id, "REJEICAO", true, { texto: "Rascunho descartado (não enviado ao emissor).", usuarioId });
}
