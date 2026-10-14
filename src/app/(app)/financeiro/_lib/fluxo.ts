import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { addDias, inicioMes, inicioSemana } from "./datas";

export type Gran = "semana" | "mes";

export type Faixa = {
  inicio: Date;
  recPrev: number;
  pagPrev: number;
  recReal: number;
  pagReal: number;
  saldoPeriodo: number;
  acumulado: number;
};

export type Fluxo = {
  saldoInicial: number; // disponibilidade nas contas ativas no início do período
  atrasadosReceber: number;
  atrasadosPagar: number;
  faixas: Faixa[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function chave(d: Date, g: Gran) {
  return (g === "semana" ? inicioSemana(d) : inicioMes(d)).getTime();
}

export async function calcularFluxo(de: Date, ate: Date, g: Gran, hoje: Date): Promise<Fluxo> {
  const fim = addDias(ate, 1);
  const [contas, antes, receber, pagar, lanc, atrR, atrP] = await Promise.all([
    db.contaBancaria.aggregate({ where: { ativo: true }, _sum: { saldoInicial: true } }),
    db.lancamento.groupBy({ by: ["sentido"], where: { conta: { ativo: true }, data: { lt: de } }, _sum: { valor: true } }),
    db.contaReceber.findMany({ where: { status: "ABERTO", vencimento: { gte: de, lt: fim } }, select: { vencimento: true, valor: true, valorBaixado: true } }),
    db.contaPagar.findMany({ where: { status: "ABERTO", vencimento: { gte: de, lt: fim } }, select: { vencimento: true, valor: true, valorBaixado: true } }),
    db.lancamento.findMany({ where: { conta: { ativo: true }, data: { gte: de, lt: fim }, transferenciaId: null }, select: { data: true, sentido: true, valor: true } }),
    db.contaReceber.aggregate({ where: { status: "ABERTO", vencimento: { lt: hoje } }, _sum: { valor: true, valorBaixado: true } }),
    db.contaPagar.aggregate({ where: { status: "ABERTO", vencimento: { lt: hoje } }, _sum: { valor: true, valorBaixado: true } }),
  ]);
  const antesSoma = (s: "ENTRADA" | "SAIDA") => toNumber(antes.find((x) => x.sentido === s)?._sum.valor);
  const saldoInicial = r2(toNumber(contas._sum.saldoInicial) + antesSoma("ENTRADA") - antesSoma("SAIDA"));
  const atrasadosReceber = r2(toNumber(atrR._sum.valor) - toNumber(atrR._sum.valorBaixado));
  const atrasadosPagar = r2(toNumber(atrP._sum.valor) - toNumber(atrP._sum.valorBaixado));

  const mapa = new Map<number, Faixa>();
  const faixa = (d: Date) => {
    const k = chave(d, g);
    let f = mapa.get(k);
    if (!f) {
      f = { inicio: new Date(k), recPrev: 0, pagPrev: 0, recReal: 0, pagReal: 0, saldoPeriodo: 0, acumulado: 0 };
      mapa.set(k, f);
    }
    return f;
  };
  // faixas vazias também aparecem, para o gráfico não ter buracos
  for (let d = new Date(chave(de, g)); d <= ate; d = g === "semana" ? addDias(d, 7) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) faixa(d);

  for (const t of receber) faixa(t.vencimento).recPrev += toNumber(t.valor) - toNumber(t.valorBaixado);
  for (const t of pagar) faixa(t.vencimento).pagPrev += toNumber(t.valor) - toNumber(t.valorBaixado);
  for (const l of lanc) {
    const f = faixa(l.data);
    if (l.sentido === "ENTRADA") f.recReal += toNumber(l.valor);
    else f.pagReal += toNumber(l.valor);
  }

  const faixas = [...mapa.values()].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  // atrasados entram como se fossem liquidados no início: é o caixa que deveria ter entrado/saído
  let acum = saldoInicial + (de <= hoje ? atrasadosReceber - atrasadosPagar : 0);
  for (const f of faixas) {
    f.recPrev = r2(f.recPrev);
    f.pagPrev = r2(f.pagPrev);
    f.recReal = r2(f.recReal);
    f.pagReal = r2(f.pagReal);
    f.saldoPeriodo = r2(f.recPrev + f.recReal - f.pagPrev - f.pagReal);
    acum = r2(acum + f.saldoPeriodo);
    f.acumulado = acum;
  }
  return { saldoInicial, atrasadosReceber, atrasadosPagar, faixas };
}
