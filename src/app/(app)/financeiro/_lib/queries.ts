import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { STATUS_TITULO, type StatusTitulo, type Tipo, type TituloRow } from "./config";
import { addDias, inicioMes, parseDia } from "@/lib/datas";
import { saldoTitulo } from "./titulos";

type SP = Record<string, string | string[] | undefined>;

export type Filtros = {
  q?: string;
  status: StatusTitulo | "TODOS";
  parceiroId?: string;
  de: Date | null;
  ate: Date | null;
  vencidos: boolean;
};

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined);

export function parseFiltros(sp: SP, parceiroParam: string): Filtros {
  const vencidos = sp.vencidos === "1";
  const s = str(sp.status);
  const status: Filtros["status"] = vencidos
    ? "ABERTO"
    : s === "TODOS"
      ? "TODOS"
      : (STATUS_TITULO as readonly string[]).includes(s ?? "")
        ? (s as StatusTitulo)
        : "ABERTO";
  return { q: str(sp.q), status, parceiroId: str(sp[parceiroParam]), de: parseDia(sp.de), ate: parseDia(sp.ate), vencidos };
}

type Range = { gte?: Date; lte?: Date; lt?: Date };
type WhereComum = {
  descricao?: { contains: string; mode: "insensitive" };
  status?: StatusTitulo;
  vencimento?: Range;
};

function rangeVenc(f: Filtros): Range | undefined {
  if (!f.de && !f.ate) return undefined;
  return { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) };
}

/** Partes do filtro comuns às duas tabelas. */
function filtroLista(f: Filtros, hoje: Date): WhereComum {
  const w: WhereComum = {};
  if (f.q) w.descricao = { contains: f.q, mode: "insensitive" };
  if (f.status !== "TODOS") w.status = f.status;
  const venc = rangeVenc(f);
  if (f.vencidos) w.vencimento = { ...venc, lt: hoje };
  else if (venc) w.vencimento = venc;
  return w;
}

export type Totais = {
  aberto: { valor: number; qtd: number };
  vencido: { valor: number; qtd: number };
  pago: { valor: number; qtd: number; de: Date; ate: Date };
};

/** Saldo em aberto = valor dos títulos - o que já foi baixado parcialmente. */
const emAberto = (s: { valor: unknown; valorBaixado: unknown }) => toNumber(s.valor as string) - toNumber(s.valorBaixado as string);

const nomeHospital = (h: { razaoSocial: string; nomeFantasia: string | null } | null) => (h ? h.nomeFantasia || h.razaoSocial : null);

type Raw = {
  id: string;
  descricao: string;
  pedidoId: number | null;
  valor: unknown;
  vencimento: Date;
  status: StatusTitulo;
  valorPago: unknown;
  valorBaixado: unknown;
  pagoEm: Date | null;
  criadoEm: Date;
  planoContaId: string | null;
  planoConta: { codigo: string; nome: string } | null;
  centroCustoId: string | null;
  centroCusto: { nome: string } | null;
  competencia: Date;
  cobrancaStatus?: string | null;
  nossoNumero?: string | null;
};

function normalizar(r: Raw, parceiroId: string | null, parceiroNome: string | null, codigoBarras: string | null = null): TituloRow {
  const valor = toNumber(r.valor as string);
  const pago = r.valorPago === null || r.valorPago === undefined ? null : toNumber(r.valorPago as string);
  const baixado = toNumber(r.valorBaixado as string);
  return {
    id: r.id,
    descricao: r.descricao,
    parceiroId,
    parceiroNome,
    pedidoId: r.pedidoId,
    planoContaId: r.planoContaId,
    categoria: r.planoConta ? `${r.planoConta.codigo} — ${r.planoConta.nome}` : null,
    centroCustoId: r.centroCustoId,
    centroNome: r.centroCusto?.nome ?? null,
    competencia: r.competencia,
    cobrancaStatus: r.cobrancaStatus ?? null,
    nossoNumero: r.nossoNumero ?? null,
    codigoBarras,
    valor,
    vencimento: r.vencimento,
    status: r.status,
    valorPago: pago,
    valorBaixado: baixado,
    saldo: r.status === "ABERTO" ? saldoTitulo(valor, baixado) : 0,
    pagoEm: r.pagoEm,
    criadoEm: r.criadoEm,
  };
}

const classSel = { planoConta: { select: { codigo: true, nome: true } }, centroCusto: { select: { nome: true } } } as const;
const parceiroSel = { select: { razaoSocial: true, nomeFantasia: true } } as const;

export async function listarTitulos(tipo: Tipo, f: Filtros, hoje: Date): Promise<{ rows: TituloRow[]; totais: Totais }> {
  const pagoDe = f.de ?? inicioMes(hoje);
  const pagoAte = f.ate ?? hoje;
  const busca = f.q ? { descricao: { contains: f.q, mode: "insensitive" as const } } : {};
  const venc = rangeVenc(f);
  const whereAberto = { ...busca, status: "ABERTO" as const, ...(venc ? { vencimento: venc } : {}) };
  const whereVencido = { ...busca, status: "ABERTO" as const, vencimento: { ...venc, lt: hoje } };
  // "pago no período" = dinheiro que efetivamente entrou/saiu (baixas), inclusive parciais
  const wherePago = { data: { gte: pagoDe, lt: addDias(pagoAte, 1) } };
  const orderBy = f.status === "ABERTO" ? [{ vencimento: "asc" as const }] : [{ vencimento: "desc" as const }];
  const lista = filtroLista(f, hoje);

  if (tipo === "receber") {
    const p = f.parceiroId ? { hospitalId: f.parceiroId } : {};
    const [rows, ab, ve, pg] = await Promise.all([
      db.contaReceber.findMany({ where: { ...p, ...lista }, include: { hospital: parceiroSel, ...classSel }, orderBy, take: 500 }),
      db.contaReceber.aggregate({ where: { ...p, ...whereAberto }, _sum: { valor: true, valorBaixado: true }, _count: true }),
      db.contaReceber.aggregate({ where: { ...p, ...whereVencido }, _sum: { valor: true, valorBaixado: true }, _count: true }),
      db.lancamento.aggregate({ where: { ...wherePago, contaReceber: { is: { ...busca, ...p } } }, _sum: { valor: true }, _count: true }),
    ]);
    return {
      rows: rows.map((r) => normalizar(r, r.hospitalId, nomeHospital(r.hospital))),
      totais: {
        aberto: { valor: emAberto(ab._sum), qtd: ab._count },
        vencido: { valor: emAberto(ve._sum), qtd: ve._count },
        pago: { valor: toNumber(pg._sum.valor), qtd: pg._count, de: pagoDe, ate: pagoAte },
      },
    };
  }

  const p = f.parceiroId ? { fornecedorId: f.parceiroId } : {};
  const [rows, ab, ve, pg] = await Promise.all([
    db.contaPagar.findMany({ where: { ...p, ...lista }, include: { fornecedor: parceiroSel, ...classSel }, orderBy, take: 500 }),
    db.contaPagar.aggregate({ where: { ...p, ...whereAberto }, _sum: { valor: true, valorBaixado: true }, _count: true }),
    db.contaPagar.aggregate({ where: { ...p, ...whereVencido }, _sum: { valor: true, valorBaixado: true }, _count: true }),
    db.lancamento.aggregate({ where: { ...wherePago, contaPagar: { is: { ...busca, ...p } } }, _sum: { valor: true }, _count: true }),
  ]);
  return {
    rows: rows.map((r) => normalizar(r, r.fornecedorId, nomeHospital(r.fornecedor))),
    totais: {
      aberto: { valor: emAberto(ab._sum), qtd: ab._count },
      vencido: { valor: emAberto(ve._sum), qtd: ve._count },
      pago: { valor: toNumber(pg._sum.valor), qtd: pg._count, de: pagoDe, ate: pagoAte },
    },
  };
}

export async function obterTitulo(tipo: Tipo, id: string): Promise<TituloRow | null> {
  if (tipo === "receber") {
    const r = await db.contaReceber.findUnique({ where: { id }, include: { hospital: parceiroSel, ...classSel } });
    return r ? normalizar(r, r.hospitalId, nomeHospital(r.hospital)) : null;
  }
  const r = await db.contaPagar.findUnique({ where: { id }, include: { fornecedor: parceiroSel, ...classSel } });
  return r ? normalizar(r, r.fornecedorId, nomeHospital(r.fornecedor), r.codigoBarras) : null;
}

/** Hospitais ou fornecedores para selects (ativos + o já vinculado). */
export async function listarParceiros(tipo: Tipo, incluirId?: string | null): Promise<{ value: string; label: string }[]> {
  const where = { OR: [{ ativo: true }, ...(incluirId ? [{ id: incluirId }] : [])] };
  const list =
    tipo === "receber"
      ? await db.hospital.findMany({ where, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } })
      : await db.fornecedor.findMany({ where, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } });
  return list.map((p) => ({ value: p.id, label: p.nomeFantasia || p.razaoSocial }));
}
