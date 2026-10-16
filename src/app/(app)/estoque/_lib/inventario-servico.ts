import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { localDoHospital, MARCA_COBRAR_HOSPITAL, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { calcularItem, planoMovimento, resumirInventario, validarResolucao, valorACobrar, type Resolucao } from "./inventario";

/**
 * Inventário de consignado: tudo que mexe no banco. Fora de "use server" para ser testado sem login.
 * Toda mutação trava a linha do inventário (FOR UPDATE): fechar duas vezes ou contar durante o fechamento não passa.
 * O saldo só muda por movimentar() (documento "INV-<n>").
 */

export const docInventario = (id: number) => `INV-${id}`;
const EM_ANDAMENTO = ["ABERTO", "CONTADO"] as const;

async function travar(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "InventarioConsignacao" WHERE id = ${id} FOR UPDATE`;
  const inv = await tx.inventarioConsignacao.findUnique({ where: { id } });
  if (!inv) throw new ErroNegocio("Inventário não encontrado.");
  return inv;
}

function exigirEditavel(status: string) {
  if (status === "FECHADO") throw new ErroNegocio("Inventário já fechado: não pode mais ser alterado.");
  if (status === "CANCELADO") throw new ErroNegocio("Inventário cancelado.");
}

/** Cria o inventário e tira a "foto" do saldo atual do consignado (um item por lote com saldo > 0). */
export async function criarInventario(tx: Tx, o: { hospitalId: string; observacao?: string | null; usuario: string }) {
  const hospital = await tx.hospital.findUnique({ where: { id: o.hospitalId } });
  if (!hospital) throw new ErroNegocio("Hospital não encontrado.");
  const localId = await localDoHospital(tx, o.hospitalId);
  await tx.$queryRaw`SELECT id FROM "LocalEstoque" WHERE id = ${localId} FOR UPDATE`; // serializa criações no mesmo hospital
  const aberto = await tx.inventarioConsignacao.findFirst({ where: { localId, status: { in: [...EM_ANDAMENTO] } } });
  if (aberto) throw new ErroNegocio(`Já existe o inventário ${docInventario(aberto.id)} em andamento neste hospital. Feche ou cancele antes de criar outro.`);
  const saldos = await tx.saldo.findMany({ where: { localId, quantidade: { gt: 0 } }, include: { produto: { select: { custoMedio: true } } } });
  return tx.inventarioConsignacao.create({
    data: {
      hospitalId: o.hospitalId,
      localId,
      criadoPor: o.usuario,
      observacao: o.observacao ?? null,
      itens: { create: saldos.map((s) => ({ produtoId: s.produtoId, loteId: s.loteId, saldoSistema: s.quantidade, valorUnit: toNumber(s.produto.custoMedio) })) },
    },
  });
}

const validarContado = (n: number | null) => {
  if (n !== null && (!Number.isInteger(n) || n < 0)) throw new ErroNegocio("A quantidade contada deve ser um número inteiro, zero ou maior.");
  if (n !== null && n > 1_000_000) throw new ErroNegocio("Quantidade contada acima do limite (1.000.000). Confira o número digitado.");
};

/** Grava as quantidades contadas (null apaga). Em CONTADO, apagar uma contagem volta o inventário para ABERTO. */
export async function salvarContagem(tx: Tx, id: number, contagens: { itemId: string; contado: number | null }[]) {
  const inv = await travar(tx, id);
  exigirEditavel(inv.status);
  for (const c of contagens) {
    validarContado(c.contado);
    const n = await tx.inventarioConsignacaoItem.updateMany({ where: { id: c.itemId, inventarioId: id }, data: { contado: c.contado } });
    if (n.count === 0) throw new ErroNegocio("Item não pertence a este inventário.");
  }
  if (inv.status === "CONTADO" && (await tx.inventarioConsignacaoItem.count({ where: { inventarioId: id, contado: null } })) > 0) {
    await tx.inventarioConsignacao.update({ where: { id }, data: { status: "ABERTO", contadoEm: null } });
  }
}

/** Inclui um lote encontrado no hospital que não estava na foto (saldoSistema = saldo atual dele no local, normalmente 0). */
export async function incluirLoteEncontrado(tx: Tx, id: number, o: { loteId: string; contado: number }) {
  const inv = await travar(tx, id);
  exigirEditavel(inv.status);
  validarContado(o.contado);
  const lote = await tx.lote.findUnique({ where: { id: o.loteId }, include: { produto: true } });
  if (!lote) throw new ErroNegocio("Lote não encontrado.");
  if (await tx.inventarioConsignacaoItem.findUnique({ where: { inventarioId_loteId: { inventarioId: id, loteId: o.loteId } } })) {
    throw new ErroNegocio("Este lote já está no inventário: digite a contagem na linha dele.");
  }
  const saldo = await tx.saldo.findUnique({ where: { loteId_localId: { loteId: o.loteId, localId: inv.localId } } });
  await tx.inventarioConsignacaoItem.create({
    data: { inventarioId: id, produtoId: lote.produtoId, loteId: lote.id, saldoSistema: saldo?.quantidade ?? 0, contado: o.contado, valorUnit: toNumber(lote.produto.custoMedio) },
  });
}

/** ABERTO → CONTADO: exige todos os itens contados. */
export async function concluirContagem(tx: Tx, id: number) {
  const inv = await travar(tx, id);
  exigirEditavel(inv.status);
  if (inv.status === "CONTADO") throw new ErroNegocio("A contagem já foi concluída.");
  const faltam = await tx.inventarioConsignacaoItem.count({ where: { inventarioId: id, contado: null } });
  if (faltam > 0) throw new ErroNegocio(`Faltam ${faltam} item(ns) sem contagem. Digite 0 para o que não foi encontrado.`);
  await tx.inventarioConsignacao.update({ where: { id }, data: { status: "CONTADO", contadoEm: new Date() } });
}

export async function cancelarInventario(tx: Tx, id: number) {
  const inv = await travar(tx, id);
  exigirEditavel(inv.status);
  await tx.inventarioConsignacao.update({ where: { id }, data: { status: "CANCELADO", canceladoEm: new Date() } });
}

type Cliente = Pick<Tx, "inventarioConsignacao" | "saldo">;

/** Itens com saldo ATUAL, divergência e resumo (usado pela tela de revisão e pelo fechamento). */
export async function revisarInventario(c: Cliente, id: number) {
  const inv = await c.inventarioConsignacao.findUnique({
    where: { id },
    include: { hospital: true, itens: { include: { produto: true, lote: true }, orderBy: [{ produto: { descricao: "asc" } }, { lote: { numero: "asc" } }] } },
  });
  if (!inv) throw new ErroNegocio("Inventário não encontrado.");
  const saldos = await c.saldo.findMany({ where: { localId: inv.localId } });
  const atual = new Map(saldos.map((s) => [s.loteId, s.quantidade]));
  const itens = inv.itens.map((i) => {
    const fechado = inv.status === "FECHADO";
    // Fechado: vale o que foi gravado no fechamento, não o saldo de hoje.
    const saldoAtual = fechado ? (i.saldoFechamento ?? i.saldoSistema) : (atual.get(i.loteId) ?? 0);
    return { ...i, saldoAtual, calc: calcularItem({ saldoSistema: i.saldoSistema, saldoAtual, contado: i.contado, valorUnit: toNumber(i.valorUnit) }) };
  });
  const foraDaFoto = inv.status === "FECHADO" || inv.status === "CANCELADO" ? 0 : saldos.filter((s) => s.quantidade > 0 && !inv.itens.some((i) => i.loteId === s.loteId)).length;
  return { inv, itens, resumo: resumirInventario(itens.map((i) => i.calc)), foraDaFoto };
}

export type ResolucaoInput = { itemId: string; resolucao: Resolucao | null; justificativa?: string | null };

/**
 * Fecha o inventário. Recalcula a divergência contra o saldo ATUAL (travado), exige resolução de cada divergência,
 * corrige o saldo por movimentar() e congela o resultado. Devolve o resumo e quantos itens tinham saldo diferente da foto.
 */
export async function fecharInventario(tx: Tx, id: number, resolucoes: ResolucaoInput[], usuario: string) {
  const inv = await travar(tx, id);
  exigirEditavel(inv.status);
  if (inv.status !== "CONTADO") throw new ErroNegocio("Conclua a contagem antes de fechar o inventário.");
  // trava os saldos do local: nenhuma remessa/consumo muda o saldo entre o cálculo e a correção
  await tx.$queryRaw`SELECT id FROM "Saldo" WHERE "localId" = ${inv.localId} FOR UPDATE`;
  const { itens, resumo } = await revisarInventario(tx, id);
  if (resumo.naoContados > 0) throw new ErroNegocio(`Faltam ${resumo.naoContados} item(ns) sem contagem.`);
  const porItem = new Map(resolucoes.map((r) => [r.itemId, r]));
  const erros: string[] = [];
  for (const i of itens) {
    const d = i.calc.diferenca ?? 0;
    const r = porItem.get(i.id);
    const msg = validarResolucao(d, r?.resolucao, r?.justificativa);
    if (msg) erros.push(`${i.produto.codigo} lote ${i.lote.numero}: ${msg}`);
  }
  if (erros.length > 0) throw new ErroNegocio(erros.slice(0, 5).join(" ") + (erros.length > 5 ? ` (+${erros.length - 5} item(ns))` : ""));

  for (const i of itens) {
    const d = i.calc.diferenca ?? 0;
    const r = porItem.get(i.id);
    const resolucao = d === 0 ? null : (r?.resolucao ?? null);
    const unit = toNumber(i.valorUnit);
    const plano = planoMovimento(d, resolucao);
    if (plano) {
      await movimentar(tx, {
        tipo: plano.tipo,
        produtoId: i.produtoId,
        loteId: i.loteId,
        quantidade: plano.quantidade,
        origemId: plano.entrada ? null : inv.localId,
        destinoId: plano.entrada ? inv.localId : null,
        custoUnit: unit,
        documento: docInventario(id),
        // a marca no início tira a falta cobrada do DRE ("Perdas e ajustes de estoque"); ver MARCA_COBRAR_HOSPITAL
        observacao: `${resolucao === "COBRAR_HOSPITAL" ? `${MARCA_COBRAR_HOSPITAL} — ` : ""}Inventário ${docInventario(id)}: ${resolucao === "COBRAR_HOSPITAL" ? "falta a cobrar do hospital" : d < 0 ? "falta" : "sobra"} (contado ${i.contado}, sistema ${i.saldoAtual})`,
        usuario,
      });
    }
    await tx.inventarioConsignacaoItem.update({
      where: { id: i.id },
      data: {
        saldoFechamento: i.saldoAtual,
        diferenca: d,
        resolucao,
        justificativa: resolucao === "JUSTIFICADA" ? (r?.justificativa ?? "").trim() : null,
        valorCobrar: valorACobrar(d, unit, resolucao),
      },
    });
  }
  await tx.inventarioConsignacao.update({ where: { id }, data: { status: "FECHADO", fechadoEm: new Date(), fechadoPor: usuario } });
  return resumo;
}
