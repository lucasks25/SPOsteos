import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { diaBrasilia, inicioDiaBrasilia } from "@/lib/datas";
import { MARCA_COBRAR_HOSPITAL } from "@/lib/estoque";
import { chaveMes, efeitosDaBaixa, type LinhaDre, type TipoPlano } from "./dre";
import type { ChaveSistema } from "./plano";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lê tudo que entra no DRE entre `inicio` (1º dia de um mês, UTC) e `fim` (1º dia do mês seguinte ao último), já com sinal de resultado.
 * Fontes: títulos por competência, avulsos e efeitos financeiros das baixas por data, CMV por faturamento, perdas e ajustes de estoque.
 */
export async function carregarLinhasDre(inicio: Date, fim: Date, centroCustoId: string | null): Promise<LinhaDre[]> {
  const planos = await db.planoConta.findMany({ select: { id: true, tipo: true, chaveSistema: true } });
  const porId = new Map(planos.map((p) => [p.id, p.tipo as TipoPlano]));
  const porChave = new Map(planos.filter((p) => p.chaveSistema).map((p) => [p.chaveSistema as ChaveSistema, p]));
  const linha = (mes: string, planoId: string | null, valor: number): LinhaDre => ({ mes, planoId, tipo: planoId ? (porId.get(planoId) ?? null) : null, valor: r2(valor) });
  const daChave = (mes: string, chave: ChaveSistema, valor: number) => {
    const p = porChave.get(chave);
    return linha(mes, p?.id ?? null, valor);
  };
  const centro = centroCustoId ? { centroCustoId } : {};
  const competencia = { gte: inicio, lt: fim };
  const instIni = inicioDiaBrasilia(inicio);
  const instFim = inicioDiaBrasilia(fim);
  const mesBrasilia = (d: Date) => chaveMes(diaBrasilia(d));
  const out: LinhaDre[] = [];

  const [receber, pagar, avulsos, baixas, pedidos, movs, glosas] = await Promise.all([
    db.contaReceber.findMany({ where: { status: { not: "CANCELADO" }, competencia, ...centro }, select: { competencia: true, planoContaId: true, valor: true } }),
    db.contaPagar.findMany({ where: { status: { not: "CANCELADO" }, competencia, ...centro }, select: { competencia: true, planoContaId: true, valor: true } }),
    db.lancamento.findMany({
      where: { contaReceberId: null, contaPagarId: null, transferenciaId: null, data: competencia, ...centro },
      select: { data: true, sentido: true, valor: true, planoContaId: true },
    }),
    db.lancamento.findMany({
      where: {
        data: competencia,
        transferenciaId: null,
        OR: [{ contaReceber: { is: centroCustoId ? { centroCustoId } : {} } }, { contaPagar: { is: centroCustoId ? { centroCustoId } : {} } }],
        AND: [{ OR: [{ juros: { gt: 0 } }, { multa: { gt: 0 } }, { desconto: { gt: 0 } }] }],
      },
      select: { data: true, juros: true, multa: true, desconto: true, contaReceberId: true },
    }),
    db.pedidoVenda.findMany({ where: { status: "FATURADO", faturadoEm: { gte: instIni, lt: instFim }, ...centro }, select: { faturadoEm: true, custoTotal: true } }),
    db.movimento.findMany({
      where: { tipo: { in: ["PERDA", "AJUSTE"] }, criadoEm: { gte: instIni, lt: instFim } },
      select: { tipo: true, criadoEm: true, quantidade: true, custoUnit: true, origemId: true, destinoId: true, documento: true, observacao: true },
    }),
    db.glosa.findMany({ where: { data: competencia, recurso: { not: "REVERTIDA" }, contaReceber: { is: centroCustoId ? { centroCustoId } : {} } }, select: { data: true, valor: true } }),
  ]);

  for (const t of receber) out.push(linha(chaveMes(t.competencia), t.planoContaId, toNumber(t.valor)));
  for (const t of pagar) out.push(linha(chaveMes(t.competencia), t.planoContaId, -toNumber(t.valor)));
  for (const a of avulsos) out.push(linha(chaveMes(a.data), a.planoContaId, a.sentido === "ENTRADA" ? toNumber(a.valor) : -toNumber(a.valor)));
  for (const b of baixas) {
    const efeitos = efeitosDaBaixa({ tipo: b.contaReceberId ? "receber" : "pagar", juros: toNumber(b.juros), multa: toNumber(b.multa), desconto: toNumber(b.desconto) });
    for (const e of efeitos) out.push(daChave(chaveMes(b.data), e.chave, e.valor));
  }
  for (const g of glosas) out.push(daChave(chaveMes(g.data), "GLOSA", -toNumber(g.valor))); // dedução da receita, na data da glosa
  for (const p of pedidos) out.push(daChave(mesBrasilia(p.faturadoEm!), "CMV", -toNumber(p.custoTotal)));
  // perda ou ajuste de saída (só origem) = custo; ajuste de entrada (só destino) = ganho; entre locais = neutro
  // movimento de estoque não tem centro de custo: com o filtro ligado ele fica de fora
  // falta de inventário cobrada do hospital (AJUSTE de saída marcado) não é perda da distribuidora: fica de fora
  const cobradaDoHospital = (m: (typeof movs)[number]) => m.tipo === "AJUSTE" && !!m.documento?.startsWith("INV-") && !!m.observacao?.startsWith(MARCA_COBRAR_HOSPITAL);
  for (const m of centroCustoId ? [] : movs) {
    if (cobradaDoHospital(m)) continue;
    const valor = m.quantidade * toNumber(m.custoUnit);
    if (m.origemId && !m.destinoId) out.push(daChave(mesBrasilia(m.criadoEm), "PERDA_ESTOQUE", -valor));
    else if (m.destinoId && !m.origemId) out.push(daChave(mesBrasilia(m.criadoEm), "PERDA_ESTOQUE", valor));
  }
  return out;
}

