/**
 * Apoio das cadeias ponta a ponta entre setores (integracao-*.test.ts): transação, limpeza e "fotos" dos números que
 * cada setor enxerga (DRE do mês, caixa, fluxo realizado, painel financeiro). As cadeias comparam foto antes × depois.
 * Dados com prefixo TESTEDB; contas bancárias com nome "TESTEDB integ".
 */
import "dotenv/config";
import { db, type Tx } from "@/lib/db";
import { addMeses, hojeUTC, inicioMes } from "@/lib/datas";
import { carregarLinhasDre } from "@/app/(app)/financeiro/_lib/dre-dados";
import { chaveMes, dreDoMes, type DreMes } from "@/app/(app)/financeiro/_lib/dre";
import { listarContas } from "@/app/(app)/financeiro/_lib/contas";
import { calcularFluxo } from "@/app/(app)/financeiro/_lib/fluxo";
import { painelFinanceiro } from "@/app/(app)/financeiro/_lib/painel";
import type { ChaveSistema } from "@/app/(app)/financeiro/_lib/plano";
import { dia, limparTudo, P } from "./_util";

export const CONTA = `${P} integ`;
const OPC = { timeout: 30_000, maxWait: 10_000 };
export const tx = <R>(f: (t: Tx) => Promise<R>) => db.$transaction(f, OPC);
export const r2 = (n: number) => Math.round(n * 100) / 100;
/** Mensagem do erro (ou "aceito") para conferir recusas sem interromper a varredura. */
export const recusa = (p: Promise<unknown>) => p.then(() => "aceito", (e: Error) => e.message);

/** Apaga o que as cadeias criam (ordem das FKs: dinheiro e remessas antes dos títulos; títulos antes dos cadastros). */
export async function limparIntegracao() {
  const contas = (await db.contaBancaria.findMany({ where: { nome: { startsWith: CONTA } }, select: { id: true } })).map((c) => c.id);
  await db.remessaCobrancaItem.deleteMany({ where: { OR: [{ remessa: { contaId: { in: contas } } }, { contaReceber: { hospital: { razaoSocial: { startsWith: P } } } }] } });
  await db.remessaCobranca.deleteMany({ where: { contaId: { in: contas } } });
  await db.cobrancaEvento.deleteMany({ where: { contaId: { in: contas } } });
  await db.extratoLinha.deleteMany({ where: { contaId: { in: contas } } });
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: contas } }, { descricao: { startsWith: P } }] } });
  await db.transferencia.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.remessaPagamento.deleteMany({ where: { contaId: { in: contas } } }); // itens em cascata
  await db.contaReceber.updateMany({ where: { cobrancaContaId: { in: contas } }, data: { cobrancaContaId: null, nossoNumero: null } });
  await db.inspecao.deleteMany({ where: { lote: { produto: { codigo: { startsWith: P } } } } });
  await limparTudo();
  await db.contaBancaria.deleteMany({ where: { id: { in: contas } } });
}

/** Conta bancária Itaú pronta para SISPAG (agência/conta únicas entre os testes) ou caixa. */
export async function mkConta(o: { tipo?: "BANCO" | "CAIXA"; agencia?: string; numero?: string; cobranca?: boolean } = {}) {
  const banco = (o.tipo ?? "BANCO") === "BANCO";
  return db.contaBancaria.create({
    data: {
      nome: `${CONTA} ${o.tipo ?? "BANCO"} ${o.numero ?? ""}`.trim(),
      tipo: o.tipo ?? "BANCO",
      ...(banco ? { banco: "341", agencia: o.agencia ?? "4455", numero: o.numero ?? "445566", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE" } : {}),
      ...(o.cobranca ? { carteiraCobranca: "109" } : {}),
      saldoInicial: 0,
    },
  });
}

export type FotoDre = { dre: DreMes; chave: Partial<Record<ChaveSistema, number>> };

/** DRE de um mês (padrão: o corrente) e o valor de cada conta do sistema nesse mês. */
export async function fotoDre(ini = inicioMes(hojeUTC())): Promise<FotoDre> {
  const linhas = await carregarLinhasDre(ini, addMeses(ini, 1), null);
  const planos = await db.planoConta.findMany({ where: { chaveSistema: { not: null } }, select: { id: true, chaveSistema: true } });
  const chave: FotoDre["chave"] = {};
  for (const p of planos) chave[p.chaveSistema as ChaveSistema] = r2(linhas.filter((l) => l.planoId === p.id).reduce((s, l) => s + l.valor, 0));
  return { dre: dreDoMes(linhas, chaveMes(ini)), chave };
}

/** Diferença (depois − antes) das linhas do DRE que as cadeias conferem. */
export function deltaDre(a: FotoDre, b: FotoDre) {
  const d = (k: keyof DreMes) => r2((b.dre[k] as number) - (a.dre[k] as number));
  const c = (k: ChaveSistema) => r2((b.chave[k] ?? 0) - (a.chave[k] ?? 0));
  return {
    receitaBruta: d("receitaBruta"),
    deducoes: d("deducoes"),
    receitaLiquida: d("receitaLiquida"),
    custos: d("custos"),
    lucroBruto: d("lucroBruto"),
    financeiro: d("financeiro"),
    resultado: d("resultadoLiquido"),
    chave: c,
  };
}

export const saldoConta = async (id: string) => (await listarContas()).find((c) => c.id === id)?.saldo ?? NaN;

/** Realizado de hoje no fluxo de caixa (entradas e saídas, sem transferências). */
export async function realizadoHoje() {
  const f = await calcularFluxo(dia(0), dia(0), "mes", hojeUTC());
  return { entradas: r2(f.faixas.reduce((s, x) => s + x.recReal, 0)), saidas: r2(f.faixas.reduce((s, x) => s + x.pagReal, 0)) };
}

/** Entradas/saídas do mês e saldo total do painel do financeiro. */
export async function painelMes() {
  const p = await painelFinanceiro(hojeUTC());
  return { ...p.mes, saldoTotal: p.saldoTotal, receber: p.receber.total.valor, pagar: p.pagar.total.valor };
}
