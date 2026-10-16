import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { addDias } from "@/lib/datas";

/** Leituras do comercial para o painel (só leitura; ARQ-05). */

const OFFSET_SP_MS = 3 * 60 * 60 * 1000; // Brasília = UTC−3

/** Cirurgias realizadas ainda sem pedido de venda. */
export async function contarAFaturar(): Promise<number> {
  return db.cirurgia.count({ where: { status: "REALIZADA" } });
}

export type IndicadoresComerciais = {
  cirurgiasHoje: number;
  cirurgias7dias: number;
  vendidoMes: number;
  margemMes: number;
  notasMes: number;
  /** últimos 6 meses (mês da NF em Brasília): total vendido e margem */
  meses: { chave: string; label: string; total: number; margem: number }[];
};

/** Indicadores do painel; `hoje` = meia-noite de hoje em Brasília (hojeSP()). */
export async function indicadoresComerciais(hoje: Date): Promise<IndicadoresComerciais> {
  const amanha = addDias(hoje, 1);
  const em7 = addDias(hoje, 7);
  const base = new Date(hoje.getTime() + OFFSET_SP_MS);
  const inicioMes = new Date(`${base.toISOString().slice(0, 7)}-01T00:00:00-03:00`);
  const meses: IndicadoresComerciais["meses"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    meses.push({ chave: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""), total: 0, margem: 0 });
  }
  const inicio6m = new Date(`${meses[0].chave}-01T00:00:00-03:00`);
  const nCir = { not: "CANCELADA" as const };
  const [cirurgiasHoje, cirurgias7dias, vendasMes, vendas6m] = await Promise.all([
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: amanha }, status: nCir } }),
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: em7 }, status: nCir } }),
    db.pedidoVenda.aggregate({ where: { status: "FATURADO", faturadoEm: { gte: inicioMes } }, _sum: { total: true, custoTotal: true }, _count: true }),
    db.pedidoVenda.findMany({ where: { status: "FATURADO", faturadoEm: { gte: inicio6m } }, select: { faturadoEm: true, total: true, custoTotal: true } }),
  ]);
  for (const v of vendas6m) {
    if (!v.faturadoEm) continue;
    const chave = new Date(v.faturadoEm.getTime() - OFFSET_SP_MS).toISOString().slice(0, 7);
    const m = meses.find((x) => x.chave === chave);
    if (m) {
      m.total += toNumber(v.total);
      m.margem += toNumber(v.total) - toNumber(v.custoTotal);
    }
  }
  const vendidoMes = toNumber(vendasMes._sum.total);
  return { cirurgiasHoje, cirurgias7dias, vendidoMes, margemMes: vendidoMes - toNumber(vendasMes._sum.custoTotal), notasMes: vendasMes._count, meses };
}

/** Próximas cirurgias agendadas/confirmadas a partir de `hoje`, com o necessário para a tabela do painel. */
export async function proximasCirurgias(hoje: Date, limite = 10) {
  const lista = await db.cirurgia.findMany({
    where: { dataHora: { gte: hoje }, status: { in: ["AGENDADA", "CONFIRMADA"] } },
    include: { hospital: true, medico: true, procedimento: true, _count: { select: { remessas: true } } },
    orderBy: { dataHora: "asc" },
    take: limite,
  });
  return lista.map((c) => ({
    id: c.id,
    numero: c.numero,
    dataHora: c.dataHora,
    status: c.status,
    medico: c.medico.nome,
    hospital: c.hospital.nomeFantasia ?? c.hospital.razaoSocial,
    procedimento: c.procedimento?.descricao ?? null,
    temVale: c._count.remessas > 0,
  }));
}
