/** Planejamento (puro) das compras: reposição mensal por fornecedor + lotes de situações especiais para a demonstração. */
import { PRODUTOS, type FornKey } from "./catalogo";
import type { CompraOpc, ItemCompra } from "./estoque";
import type { PlanoCirurgia, PlanoVenda } from "./plano";
import { addD, dia, diaUtil } from "./util";

export type EventoCompra = { t: Date; opc: CompraOpc };

const IMP1 = { cambio: 5.31, incoterm: "FOB", invoice: "SL-INV-26-0187", di: "26/0412558-3", despesasPct: { freteIntl: 0.031, ii: 0.06, despachante: 0.009, armazenagem: 0.006 } };
const IMP2 = { cambio: 5.46, incoterm: "CIF", invoice: "SL-INV-26-0261", di: "26/0731904-5", despesasPct: { freteIntl: 0.029, ii: 0.06, despachante: 0.009, armazenagem: 0.006 } };

const IMP3 = { cambio: 5.46, incoterm: "CIF", invoice: "SL-INV-26-0342", di: "26/1087431-0", despesasPct: { freteIntl: 0.029, ii: 0.06, despachante: 0.009, armazenagem: 0.006 } };

const MESES: [string, Date][] = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((m) => [m, dia(`${m}-01`)]);

export function planejarCompras(planos: PlanoCirurgia[], vendas: PlanoVenda[], hoje: Date): EventoCompra[] {
  // necessidade líquida (usado + o que fica consignado) por mês e produto
  const need = new Map<string, Map<string, number>>();
  for (const p of planos) {
    if (p.destino === "CANCELADA") continue;
    const m = p.dia.toISOString().slice(0, 7);
    const mp = need.get(m) ?? new Map<string, number>();
    for (const it of p.itens) mp.set(it.cod, (mp.get(it.cod) ?? 0) + it.qtd + it.deixar);
    need.set(m, mp);
  }
  for (const v of vendas) {
    const m = v.dia.toISOString().slice(0, 7);
    const mp = need.get(m) ?? new Map<string, number>();
    for (const it of v.itens) mp.set(it.cod, (mp.get(it.cod) ?? 0) + it.qtd);
    need.set(m, mp);
  }
  const forn = new Map(PRODUTOS.map((p) => [p.cod, p.forn]));
  const custoDe = new Map(PRODUTOS.map((p) => [p.cod, p.custo]));
  /** Quantidade a comprar: itens caros com folga mínima, baratos com folga maior. `extra` cobre agenda futura/início do mês seguinte. */
  const qtdCompra = (cod: string, q: number, extra: number) => {
    const custo = custoDe.get(cod) ?? 500;
    if (custo >= 1500) return Math.max(1, Math.ceil(q * (1 + extra)));
    if (custo >= 400) return Math.max(2, Math.ceil(q * (1.1 + extra)) + 1);
    return Math.max(6, Math.ceil(q * (1.2 + extra)) + 4);
  };
  const itensDo = (f: FornKey, meses: string[], extra: number): ItemCompra[] => {
    const tot = new Map<string, number>();
    for (const m of meses) for (const [cod, q] of need.get(m) ?? []) if (forn.get(cod) === f) tot.set(cod, (tot.get(cod) ?? 0) + q);
    return [...tot].map(([cod, q]) => ({ cod, qtd: qtdCompra(cod, q, extra) }));
  };
  const out: EventoCompra[] = [];
  const ev = (data: Date, o: Omit<CompraOpc, "data">) => out.push({ t: data, opc: { ...o, data } });
  const diaPrev = (m: Date, d: number) => diaUtil(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, d)));

  // importação (implantáveis e instrumentais): três remessas, cada uma cobrindo dois meses
  ev(dia("2026-04-24"), {
    forn: "IMPL",
    itens: [...itensDo("IMPL", ["2026-05", "2026-06"], 0.05), { cod: "COL-1012", qtd: 6, especial: true }, { cod: "INS-7001", qtd: 4 }, { cod: "INS-7002", qtd: 4 }, { cod: "INS-7003", qtd: 1 }],
    importacao: IMP1, antecedencia: 58,
  });
  ev(dia("2026-06-24"), { forn: "IMPL", itens: itensDo("IMPL", ["2026-07", "2026-08"], 0.05), importacao: IMP2, antecedencia: 55 });
  ev(dia("2026-08-24"), {
    forn: "IMPL", itens: [...itensDo("IMPL", ["2026-09", "2026-10"], 0.12), { cod: "COL-1008", qtd: 4, especial: true, validade: addD(hoje, 58) }, { cod: "COL-1013", qtd: 10 }],
    importacao: IMP3, antecedencia: 52,
  });

  // reposição mensal dos fornecedores nacionais (recebida no fim do mês anterior)
  const dias: Record<string, number> = { BIOL: 24, DESC: 25, ENDO: 26 };
  for (const [m, ini] of MESES) {
    for (const f of ["BIOL", "DESC", "ENDO"] as const) {
      const itens = itensDo(f, [m], m === "2026-10" ? 0.2 : 0.05);
      // lotes extras para as situações da demonstração
      if (f === "BIOL" && m === "2026-05") itens.push({ cod: "BIO-2002", qtd: 3, especial: true, validade: addD(hoje, 1) });
      if (f === "BIOL" && m === "2026-08") itens.push({ cod: "BIO-2007", qtd: 6 });
      if (f === "ENDO" && m === "2026-06") itens.push({ cod: "END-4003", qtd: 4 });
      if (f === "DESC" && m === "2026-10") itens.push({ cod: "DOR-3001", qtd: 30, especial: true, validade: addD(hoje, 34) });
      if (f === "BIOL" && m === "2026-10") itens.push({ cod: "BIO-2005", qtd: 12, especial: true, validade: addD(hoje, 47) });
      if (f === "ENDO" && m === "2026-10") itens.push({ cod: "END-4004", qtd: 10, especial: true, resultado: "NAO_CONFORME" });
      if (itens.length) ev(diaPrev(ini, dias[f]), { forn: f, itens });
    }
  }
  // recebimentos recentes: dois em quarentena e um parcial
  ev(dia("2026-10-13"), { forn: "IMPL", itens: [{ cod: "COL-1011", qtd: 3, resultado: null, especial: true }, { cod: "COL-1010", qtd: 3, resultado: null, especial: true }], aprovar: false, antecedencia: 12 });
  ev(dia("2026-10-14"), { forn: "DESC", itens: [{ cod: "DOR-3003", qtd: 60, recebe: 40 }, { cod: "VTP-5002", qtd: 30 }], aprovar: false, antecedencia: 6 });
  ev(dia("2026-10-15"), { forn: "DESC", itens: [{ cod: "VTP-5001", qtd: 6, resultado: null, especial: true }], aprovar: false, antecedencia: 8 });
  return out.sort((a, b) => a.t.getTime() - b.t.getTime());
}
