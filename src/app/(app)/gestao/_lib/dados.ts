import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { nomeHospital } from "../../comercial/_lib/opcoes";
import { DIAS_CONSUMO, type EntradaGiro } from "./giro";
import type { PedidoMargem } from "./margens";
import type { SaldoLote } from "./vencimentos";
import { janelaVendas, type VendaPedido } from "./vendas-mes";

/** Pedidos de venda FATURADOS com faturadoEm em [gte, lt), com itens (preço e custo congelados). Uma consulta só. */
export async function carregarPedidosFaturados(f: { gte: Date; lt: Date; hospitalId?: string; representanteId?: string }): Promise<PedidoMargem[]> {
  const rows = await db.pedidoVenda.findMany({
    where: {
      status: "FATURADO",
      faturadoEm: { gte: f.gte, lt: f.lt },
      ...(f.hospitalId ? { hospitalId: f.hospitalId } : {}),
      ...(f.representanteId ? { representanteId: f.representanteId } : {}),
    },
    select: {
      id: true,
      hospitalId: true,
      hospital: { select: { razaoSocial: true, nomeFantasia: true } },
      representanteId: true,
      representante: { select: { nome: true } },
      comissao: true,
      itens: { select: { produtoId: true, quantidade: true, precoUnit: true, custoUnit: true, produto: { select: { codigo: true, descricao: true } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    hospitalId: p.hospitalId,
    hospital: nomeHospital(p.hospital),
    representanteId: p.representanteId,
    representante: p.representante?.nome ?? "Sem representante",
    comissao: toNumber(p.comissao),
    itens: p.itens.map((i) => ({ produtoId: i.produtoId, codigo: i.produto.codigo, descricao: i.produto.descricao, quantidade: i.quantidade, precoUnit: toNumber(i.precoUnit), custoUnit: toNumber(i.custoUnit) })),
  }));
}

/** Estoque por produto (por tipo de local) + consumo dos últimos 90 dias + último consumo de todos os tempos. 5 consultas, sem N+1. */
export async function carregarEntradasGiro(agora: Date): Promise<EntradaGiro[]> {
  const desde = new Date(agora.getTime() - DIAS_CONSUMO * 24 * 60 * 60 * 1000);
  const [produtos, locais, saldos, consumo, ultimo] = await Promise.all([
    db.produto.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true, estoqueMinimo: true, custoMedio: true } }),
    db.localEstoque.findMany({ select: { id: true, tipo: true } }),
    db.saldo.groupBy({ by: ["produtoId", "localId"], where: { quantidade: { gt: 0 } }, _sum: { quantidade: true } }),
    db.movimento.groupBy({ by: ["produtoId"], where: { tipo: "CONSUMO", criadoEm: { gte: desde, lte: agora } }, _sum: { quantidade: true } }),
    db.movimento.groupBy({ by: ["produtoId"], where: { tipo: "CONSUMO" }, _max: { criadoEm: true } }),
  ]);
  const tipoLocal = new Map(locais.map((l) => [l.id, l.tipo]));
  const porProduto = new Map<string, { DEPOSITO: number; HOSPITAL: number; QUARENTENA: number; NAO_CONFORME: number }>();
  for (const s of saldos) {
    const t = tipoLocal.get(s.localId);
    if (!t) continue;
    const a = porProduto.get(s.produtoId) ?? { DEPOSITO: 0, HOSPITAL: 0, QUARENTENA: 0, NAO_CONFORME: 0 };
    a[t] += s._sum.quantidade ?? 0;
    porProduto.set(s.produtoId, a);
  }
  const cons = new Map(consumo.map((c) => [c.produtoId, c._sum.quantidade ?? 0]));
  const ult = new Map(ultimo.map((c) => [c.produtoId, c._max.criadoEm]));
  return produtos.map((p) => {
    const s = porProduto.get(p.id);
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.descricao,
      estoqueMinimo: p.estoqueMinimo,
      custoMedio: toNumber(p.custoMedio),
      deposito: s?.DEPOSITO ?? 0,
      consignado: s?.HOSPITAL ?? 0,
      quarentena: s?.QUARENTENA ?? 0,
      naoConforme: s?.NAO_CONFORME ?? 0,
      consumo: cons.get(p.id) ?? 0,
      ultimoConsumo: ult.get(p.id) ?? null,
    };
  });
}

/** Saldos com lote que vence em até 180 dias (ou já vencido), com local e hospital. Uma consulta só. */
export async function carregarSaldosLote(limite: Date): Promise<SaldoLote[]> {
  const rows = await db.saldo.findMany({
    where: { quantidade: { gt: 0 }, lote: { validade: { lte: limite } }, local: { tipo: { not: "NAO_CONFORME" } } },
    select: {
      quantidade: true,
      lote: { select: { id: true, numero: true, validade: true, produto: { select: { id: true, codigo: true, descricao: true, custoMedio: true } } } },
      local: { select: { tipo: true, hospitalId: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } },
    },
  });
  return rows.map((r) => ({
    loteId: r.lote.id,
    lote: r.lote.numero,
    produtoId: r.lote.produto.id,
    codigo: r.lote.produto.codigo,
    produto: r.lote.produto.descricao,
    validade: r.lote.validade,
    quantidade: r.quantidade,
    custoMedio: toNumber(r.lote.produto.custoMedio),
    localTipo: r.local.tipo,
    hospitalId: r.local.hospitalId,
    hospital: r.local.hospital ? nomeHospital(r.local.hospital) : null,
  }));
}

/** Pedidos faturados dos últimos 24 meses (12 do relatório + 12 do comparativo), só data e total. */
export async function carregarVendasMeses(fim: { ano: number; mes: number }, hospitalId?: string): Promise<VendaPedido[]> {
  const { gte, lt } = janelaVendas(fim);
  const rows = await db.pedidoVenda.findMany({
    where: { status: "FATURADO", faturadoEm: { gte, lt }, ...(hospitalId ? { hospitalId } : {}) },
    select: { faturadoEm: true, total: true },
  });
  return rows.flatMap((r) => (r.faturadoEm ? [{ faturadoEm: r.faturadoEm, total: toNumber(r.total) }] : []));
}
