import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { listarContas } from "./contas";
import { addDias, inicioMes } from "./datas";
import type { Tipo } from "./config";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Faixa = { valor: number; qtd: number };

/** Saldo em aberto (valor - já baixado) de um tipo de título, por faixa de vencimento. */
export type Faixas = {
  total: Faixa;
  vencido: Faixa; // vencimento antes de hoje
  hoje: Faixa;
  ate7: Faixa; // de amanhã até daqui a 7 dias
  ate30: Faixa; // de 8 a 30 dias
  depois: Faixa; // além de 30 dias
};

type Range = { gte?: Date; lt?: Date };

async function somaAberto(tipo: Tipo, vencimento?: Range): Promise<Faixa> {
  const where = { status: "ABERTO" as const, ...(vencimento ? { vencimento } : {}) };
  const args = { where, _sum: { valor: true, valorBaixado: true }, _count: true } as const;
  const r = tipo === "receber" ? await db.contaReceber.aggregate(args) : await db.contaPagar.aggregate(args);
  return { valor: r2(toNumber(r._sum.valor) - toNumber(r._sum.valorBaixado)), qtd: r._count };
}

/**
 * `hoje` é o dia de hoje em Brasília como meia-noite UTC (ver `hojeUTC`), a mesma convenção com que
 * os vencimentos são gravados. Um título que vence hoje NÃO é vencido.
 */
export async function faixasAbertas(tipo: Tipo, hoje: Date): Promise<Faixas> {
  const amanha = addDias(hoje, 1);
  const [total, vencido, doDia, ate7, ate30, depois] = await Promise.all([
    somaAberto(tipo),
    somaAberto(tipo, { lt: hoje }),
    somaAberto(tipo, { gte: hoje, lt: amanha }),
    somaAberto(tipo, { gte: amanha, lt: addDias(hoje, 8) }),
    somaAberto(tipo, { gte: addDias(hoje, 8), lt: addDias(hoje, 31) }),
    somaAberto(tipo, { gte: addDias(hoje, 31) }),
  ]);
  return { total, vencido, hoje: doDia, ate7, ate30, depois };
}

export async function painelFinanceiro(hoje: Date) {
  const mes = inicioMes(hoje);
  const [contas, receber, pagar, realizado, extratoPend, semExtrato, remessaItens, vencidosRec, proximosPagar] = await Promise.all([
    listarContas(false),
    faixasAbertas("receber", hoje),
    faixasAbertas("pagar", hoje),
    db.lancamento.groupBy({ by: ["sentido"], where: { data: { gte: mes, lt: addDias(hoje, 1) }, conta: { ativo: true }, transferenciaId: null }, _sum: { valor: true } }),
    db.extratoLinha.count({ where: { lancamentoId: null, conta: { ativo: true } } }),
    db.lancamento.count({ where: { extrato: null, conta: { ativo: true, tipo: "BANCO" } } }),
    db.remessaPagamentoItem.groupBy({ by: ["status"], where: { status: { in: ["ENVIADO", "AGENDADO", "REJEITADO"] }, contaPagar: { status: "ABERTO" } }, _count: true }),
    db.contaReceber.findMany({
      where: { status: "ABERTO", vencimento: { lt: hoje } },
      select: { valor: true, valorBaixado: true, vencimento: true, hospital: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
      take: 2000,
    }),
    db.contaPagar.findMany({
      where: { status: "ABERTO", vencimento: { lt: addDias(hoje, 15) } },
      orderBy: { vencimento: "asc" },
      take: 8,
      select: { id: true, descricao: true, valor: true, valorBaixado: true, vencimento: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } },
    }),
  ]);

  const entradasMes = toNumber(realizado.find((x) => x.sentido === "ENTRADA")?._sum.valor);
  const saidasMes = toNumber(realizado.find((x) => x.sentido === "SAIDA")?._sum.valor);
  const saldoTotal = r2(contas.reduce((s, c) => s + c.saldo, 0));
  const itens = (st: string) => remessaItens.find((x) => x.status === st)?._count ?? 0;

  // maiores devedores vencidos por hospital
  const porHospital = new Map<string, { nome: string; id: string; valor: number; qtd: number; maisAntigo: Date }>();
  for (const t of vencidosRec) {
    const h = t.hospital;
    const chave = h?.id ?? "sem";
    const atual = porHospital.get(chave) ?? { nome: h ? h.nomeFantasia || h.razaoSocial : "Sem hospital", id: chave, valor: 0, qtd: 0, maisAntigo: t.vencimento };
    atual.valor += toNumber(t.valor) - toNumber(t.valorBaixado);
    atual.qtd++;
    if (t.vencimento < atual.maisAntigo) atual.maisAntigo = t.vencimento;
    porHospital.set(chave, atual);
  }
  const inadimplentes = [...porHospital.values()]
    .map((h) => ({ ...h, valor: r2(h.valor), diasAtraso: Math.round((hoje.getTime() - h.maisAntigo.getTime()) / 86_400_000) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  return {
    contas,
    saldoTotal,
    receber,
    pagar,
    /** saldo hoje + a receber - a pagar, contando tudo que vence em até 30 dias (inclusive atrasados) */
    projecao30: r2(saldoTotal + (receber.vencido.valor + receber.hoje.valor + receber.ate7.valor + receber.ate30.valor) - (pagar.vencido.valor + pagar.hoje.valor + pagar.ate7.valor + pagar.ate30.valor)),
    mes: { entradas: r2(entradasMes), saidas: r2(saidasMes), resultado: r2(entradasMes - saidasMes) },
    pendencias: { extrato: extratoPend, semExtrato, remessaAguardando: itens("ENVIADO") + itens("AGENDADO"), remessaRejeitada: itens("REJEITADO") },
    inadimplentes,
    proximosPagar: proximosPagar.map((t) => ({
      id: t.id,
      descricao: t.descricao,
      fornecedor: t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : null,
      vencimento: t.vencimento,
      saldo: r2(toNumber(t.valor) - toNumber(t.valorBaixado)),
    })),
  };
}
