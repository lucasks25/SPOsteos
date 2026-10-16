/** Compras, recebimento, inspeção e escolha de lotes (FEFO) da demonstração: sempre pelos serviços reais. */
import { LOCAIS } from "@/lib/estoque";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { salvarDespesaTx } from "@/app/(app)/compras/_lib/importacao-servico";
import { inspecionarLoteServico } from "@/app/(app)/qualidade/_lib/inspecao-servico";
import { conta, redatarMovs, type Ctx, type ProdInfo } from "./ctx";
import { addD, entre, hora, r2 } from "./util";

export type ItemCompra = {
  cod: string;
  qtd: number;
  /** Quantidade recebida (padrão: toda). Menor que `qtd` deixa o pedido PARCIAL. */
  recebe?: number;
  validade?: Date;
  /** Lote que o FEFO da demonstração não consome. */
  especial?: boolean;
  /** Padrão LIBERADO; null deixa na quarentena (aguardando inspeção). */
  resultado?: "LIBERADO" | "NAO_CONFORME" | null;
};

export type Importacao = { cambio: number; incoterm: string; invoice: string; di: string; despesasPct: { freteIntl: number; ii: number; despachante: number; armazenagem: number } };

export type CompraOpc = {
  forn: string;
  data: Date; // dia do recebimento
  itens: ItemCompra[];
  importacao?: Importacao;
  /** Dias entre a criação do pedido e o recebimento. */
  antecedencia?: number;
  /** A conta a pagar nasce aprovada? Padrão sim (recente fica pendente de propósito). */
  aprovar?: boolean;
  observacao?: string;
};

let seqLote = 0;

export async function infoProduto(c: Ctx, cod: string): Promise<ProdInfo> {
  const p = c.prod.get(cod);
  if (p) return p;
  const x = await c.tx.produto.findUniqueOrThrow({ where: { codigo: cod } });
  const info: ProdInfo = { id: x.id, cod, desc: x.descricao, custo: Number(x.custoMedio.toString()) || Number(x.precoBase.toString()) * 0.4, preco: Number(x.precoBase.toString()), forn: "MEDL" };
  c.prod.set(cod, info);
  return info;
}

/** Custo de compra com correção suave mês a mês (abr/2026 = base) e variação entre fornecimentos. */
function custoNoMes(c: Ctx, p: ProdInfo, data: Date) {
  const meses = (data.getUTCFullYear() - 2026) * 12 + data.getUTCMonth() - 3;
  return r2(p.custo * (1 + 0.006 * Math.max(0, meses)) * (0.985 + c.rnd() * 0.03));
}

/** Pedido de compra recebido (lote em quarentena → inspeção → depósito), com conta a pagar. */
export async function comprar(c: Ctx, o: CompraOpc) {
  const { tx } = c;
  const imp = o.importacao;
  const fornecedorId = c.forn.get(o.forn)!;
  const itens: { cod: string; info: ProdInfo; spec: ItemCompra; custoUnit: number; precoMoeda: number | null }[] = [];
  for (const spec of o.itens) {
    const info = await infoProduto(c, spec.cod);
    const nominal = custoNoMes(c, info, o.data);
    const precoMoeda = imp ? r2(nominal / imp.cambio / 1.14) : null;
    itens.push({ cod: spec.cod, info, spec, custoUnit: imp ? r2(precoMoeda! * imp.cambio) : nominal, precoMoeda });
  }
  const antes = o.antecedencia ?? (imp ? 55 : 9);
  const pedido = await tx.pedidoCompra.create({
    data: {
      fornecedorId, previsao: o.data, criadoEm: hora(addD(o.data, -antes), 9, 30), observacao: o.observacao ?? null,
      ...(imp
        ? {
            importacao: true, invoice: imp.invoice, numeroDi: imp.di, moeda: "USD", cambio: imp.cambio, tipoCambio: "PTAX" as const, incoterm: imp.incoterm,
            dataInvoice: addD(o.data, -40), dataRegistroDi: addD(o.data, -8), dataDesembaraco: addD(o.data, -4),
          }
        : {}),
    },
  });
  const itemIds: string[] = [];
  for (const it of itens) {
    const row = await tx.pedidoCompraItem.create({
      data: { pedidoId: pedido.id, produtoId: it.info.id, quantidade: it.spec.qtd, custoUnit: it.custoUnit, ...(imp ? { precoMoeda: it.precoMoeda } : {}) },
    });
    itemIds.push(row.id);
  }

  if (imp) {
    const total = itens.reduce((s, it) => s + it.spec.qtd * it.custoUnit, 0);
    const d = imp.despesasPct;
    const medl = c.forn.get("MEDL")!;
    const despesas = [
      { tipo: "FRETE_INTERNACIONAL" as const, valor: r2(total * d.freteIntl), forn: medl, venc: addD(o.data, 10), desc: "Frete internacional" },
      { tipo: "II" as const, valor: r2(total * d.ii), forn: null, venc: o.data, desc: "Imposto de importação (DI)" },
      { tipo: "DESPACHANTE" as const, valor: r2(total * d.despachante), forn: medl, venc: addD(o.data, 15), desc: "Honorários do despachante" },
      { tipo: "ARMAZENAGEM" as const, valor: r2(total * d.armazenagem), forn: medl, venc: addD(o.data, 15), desc: "Armazenagem alfandegada" },
    ];
    for (const x of despesas) {
      await salvarDespesaTx(tx, pedido.id, null, {
        tipo: x.tipo, descricao: x.desc, valor: x.valor, integraCusto: null, criterio: "VALOR", itemId: null,
        gerarConta: true, fornecedorId: x.forn, vencimento: x.venc,
      }, c.u.compras.id);
    }
  }

  const recebidos: { cod: string; loteId: string; qtd: number; resultado: ItemCompra["resultado"] }[] = [];
  const aaMm = `${String(o.data.getUTCFullYear()).slice(2)}${String(o.data.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const [i, it] of itens.entries()) {
    const qtd = it.spec.recebe ?? it.spec.qtd;
    const sufixo = it.spec.especial ? "E" : "";
    const lote = `${o.forn.slice(0, 2)}${aaMm}-${String(++seqLote).padStart(3, "0")}${sufixo}`;
    const r = await receberItemTx(tx, {
      itemId: itemIds[i], quantidade: qtd, lote, validade: it.spec.validade ?? addD(o.data, entre(c.rnd, 730, 1095)),
      fabricacao: addD(o.data, -entre(c.rnd, 90, 240)), serie: null, usuario: c.u.compras.nome, usuarioId: c.u.compras.id,
    });
    recebidos.push({ cod: it.cod, loteId: r.loteId, qtd, resultado: it.spec.resultado === undefined ? "LIBERADO" : it.spec.resultado });
    if (it.spec.especial) c.especiais.add(r.loteId);
    await tx.lote.update({ where: { id: r.loteId }, data: { criadoEm: hora(o.data, 10) } });
  }
  await redatarMovs(c, hora(o.data, 10));

  // contas a pagar geradas (mercadoria e despesas de importação)
  const aps = await tx.contaPagar.findMany({ where: { pedidoId: pedido.id }, select: { id: true, valor: true, vencimento: true, despesaImportacao: { select: { id: true } } } });
  for (const ap of aps) {
    const venc = ap.despesaImportacao ? ap.vencimento : addD(o.data, imp ? 75 : 30);
    await tx.contaPagar.update({ where: { id: ap.id }, data: { competencia: o.data, vencimento: venc, criadoEm: hora(o.data, 10, 20) } });
    c.pagar.push({ id: ap.id, valor: Number(ap.valor.toString()), vencimento: venc, criado: o.data, aprovar: o.aprovar ?? true, pagar: true, forma: imp ? "TED" : "BOLETO" });
  }

  // inspeção no dia seguinte
  for (const r of recebidos) {
    if (r.resultado === null) continue;
    const ok = r.resultado === "LIBERADO";
    await inspecionarLoteServico(tx, r.loteId, {
      resultado: r.resultado!, embalagemOk: ok, rotulagemOk: true, documentacaoOk: true,
      observacao: ok ? "Conferido com a nota fiscal e o certificado do fabricante." : "Embalagem estéril violada em parte da caixa; lote segregado e devolução combinada com o fornecedor.",
      inspetor: c.u.qualidade.nome,
    });
    await tx.inspecao.updateMany({ where: { loteId: r.loteId, criadoEm: { gte: c.t0 } }, data: { criadoEm: hora(addD(o.data, 1), 14, 30) } });
    await redatarMovs(c, hora(addD(o.data, 1), 15));
  }
  conta(c, "Pedido de compra", 1);
  conta(c, "Lote", recebidos.length);
  return { pedidoId: pedido.id, recebidos };
}

export type Linha = { produtoId: string; loteId: string; quantidade: number };

/** Disponível para a demonstração: depósito, lote liberado e válido, fora dos lotes especiais. */
export async function disponivel(c: Ctx, cod: string) {
  const p = await infoProduto(c, cod);
  const r = await c.tx.saldo.aggregate({
    where: { produtoId: p.id, localId: LOCAIS.DEPOSITO, quantidade: { gt: 0 }, lote: { status: "LIBERADO", validade: { gte: c.hoje }, id: { notIn: [...c.especiais] } } },
    _sum: { quantidade: true },
  });
  return r._sum.quantidade ?? 0;
}

/** Garante estoque; se faltar, faz uma compra de reposição urgente alguns dias antes. */
export async function garantirDisponivel(c: Ctx, cod: string, qtd: number, data: Date) {
  const tem = await disponivel(c, cod);
  if (tem >= qtd) return;
  const p = await infoProduto(c, cod);
  await comprar(c, { forn: p.forn, data: addD(data, -3), itens: [{ cod, qtd: qtd - tem + 4 + Math.ceil(qtd * 0.3) }], antecedencia: 5, observacao: "Reposição urgente para cirurgia agendada" });
  conta(c, "Compra de reposição urgente", 1);
}

/** Lotes do produto por FEFO (vence primeiro, sai primeiro), dividindo entre lotes se preciso. */
export async function pegarLotes(c: Ctx, cod: string, qtd: number): Promise<Linha[]> {
  const p = await infoProduto(c, cod);
  const saldos = await c.tx.saldo.findMany({
    where: { produtoId: p.id, localId: LOCAIS.DEPOSITO, quantidade: { gt: 0 }, lote: { status: "LIBERADO", validade: { gte: c.hoje }, id: { notIn: [...c.especiais] } } },
    include: { lote: { select: { validade: true, numero: true } } },
    orderBy: [{ lote: { validade: "asc" } }, { lote: { numero: "asc" } }],
  });
  const reservado = await c.tx.remessaItem.groupBy({ by: ["loteId"], where: { loteId: { in: saldos.map((s) => s.loteId) }, remessa: { status: "ABERTA" } }, _sum: { quantidade: true } });
  const res = new Map(reservado.map((r) => [r.loteId, r._sum.quantidade ?? 0]));
  const out: Linha[] = [];
  let resta = qtd;
  for (const s of saldos) {
    if (resta <= 0) break;
    const livre = s.quantidade - (res.get(s.loteId) ?? 0);
    if (livre <= 0) continue;
    const q = Math.min(livre, resta);
    out.push({ produtoId: p.id, loteId: s.loteId, quantidade: q });
    resta -= q;
  }
  if (resta > 0) throw new Error(`Estoque insuficiente na carga para ${cod} (faltam ${resta}).`);
  return out;
}
