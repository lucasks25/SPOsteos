import "server-only";
import { db, type Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { diaBrasilia } from "@/lib/datas";
import { ratear, r2, type DadosImportacao, type Destinatario, type EntradaNfe, type ItemEntrada, type ProdutoFiscal, type ValoresImportacaoItem } from "./nfe";
import type { Operacao } from "./nfe-regras";

/**
 * Lê a ORIGEM da nota (só leitura de tabelas de outros módulos, ADR-2) e devolve a entrada da montagem pura (nfe.ts).
 * Origens: vale (Remessa, estoque), pedido de venda (comercial), pedido de importação (compras).
 */

type Client = Tx | typeof db;

export type Origem = { tipo: "REMESSA" | "PEDIDO_VENDA" | "PEDIDO_COMPRA"; id: number };

/** Dados que o usuário completa na tela (o sistema não tem onde buscar). */
export type Complemento = {
  chavesManuais: string[];
  informacoes: string | null;
  importacao?: Omit<DadosImportacao, "numeroDi" | "dataDi" | "dataDesembaraco" | "valorAfrmm"> & { pais: string };
};

export type OrigemLida = {
  operacao: Operacao;
  entrada: EntradaNfe;
  vinculo: { hospitalId: string | null; fornecedorId: string | null; pedidoVendaId: number | null; remessaId: number | null; pedidoCompraId: number | null };
  /** Venda: vencimento do título gerado ao autorizar (hoje + prazo do hospital, dia de Brasília). */
  vencimento: Date | null;
  descricaoOrigem: string;
};

const PRODUTO_FISCAL = {
  id: true,
  codigo: true,
  descricao: true,
  ncm: true,
  cest: true,
  gtin: true,
  unidade: true,
  unidadeTributavel: true,
  origem: true,
  registroAnvisa: true,
  controlaLote: true,
} as const;

const HOSPITAL_DEST = { id: true, razaoSocial: true, cnpj: true, ie: true, endereco: true, bairro: true, cep: true, cidade: true, uf: true, email: true, prazoPagamentoDias: true, tabelaPrecoId: true } as const;

type HospitalDest = { razaoSocial: string; cnpj: string; ie: string | null; endereco: string | null; bairro: string | null; cep: string | null; cidade: string | null; uf: string | null; email: string | null };

function destHospital(h: HospitalDest): Destinatario {
  return { nome: h.razaoSocial, documento: h.cnpj, ie: h.ie, endereco: h.endereco, bairro: h.bairro, cep: h.cep, municipio: h.cidade, uf: h.uf ?? "", pais: null, email: h.email };
}

const loteFiscal = (l: { numero: string; fabricacao: Date | null; validade: Date | null } | null) => (l ? { numero: l.numero, fabricacao: l.fabricacao, validade: l.validade } : null);

/** Preço para a nota de remessa: tabela do hospital vigente, senão preço base (mesma regra do faturamento, comercial/_lib/precos.ts). */
async function precosHospital(c: Client, tabelaPrecoId: string | null, produtoIds: string[], ref = new Date()) {
  const prods = await c.produto.findMany({ where: { id: { in: produtoIds } }, select: { id: true, precoBase: true } });
  const out = new Map(prods.map((p) => [p.id, toNumber(p.precoBase)]));
  if (!tabelaPrecoId) return out;
  const t = await c.tabelaPreco.findUnique({ where: { id: tabelaPrecoId }, include: { itens: { where: { produtoId: { in: produtoIds } } } } });
  const dia = diaBrasilia(ref).getTime();
  const vigente = t && !(t.vigenciaInicio && t.vigenciaInicio.getTime() > dia) && !(t.vigenciaFim && t.vigenciaFim.getTime() < dia);
  if (vigente) for (const i of t.itens) out.set(i.produtoId, toNumber(i.preco));
  return out;
}

/** Notas de remessa AUTORIZADAS deste hospital que contêm o produto/lote: chaves e o valor unitário de cada (produto, lote). */
async function remessasAutorizadas(c: Client, hospitalId: string, remessaId?: number) {
  const notas = await c.notaFiscal.findMany({
    where: { tipo: "REMESSA_CONSIGNACAO", status: "AUTORIZADA", hospitalId, ...(remessaId ? { remessaId } : {}) },
    select: { chave: true, itens: { select: { produtoId: true, loteNumero: true, valorUnitario: true } } },
    orderBy: { id: "desc" },
  });
  return notas.flatMap((n) => n.itens.map((i) => ({ chave: n.chave!, produtoId: i.produtoId, lote: i.loteNumero, valor: toNumber(i.valorUnitario) })));
}

function chavesDe(refs: { chave: string; produtoId: string; lote: string | null }[], itens: { produtoId: string; lote: string | null }[]) {
  const out = new Set<string>();
  for (const it of itens) {
    const r = refs.find((x) => x.produtoId === it.produtoId && x.lote === it.lote);
    if (r) out.add(r.chave);
  }
  return [...out];
}

async function lerRemessa(c: Client, id: number, op: "REMESSA_CONSIGNACAO" | "RETORNO_CONSIGNACAO", comp: Complemento): Promise<OrigemLida> {
  const r = await c.remessa.findUnique({
    where: { id },
    include: {
      local: { select: { hospital: { select: HOSPITAL_DEST } } },
      itens: { include: { produto: { select: PRODUTO_FISCAL }, lote: { select: { numero: true, fabricacao: true, validade: true } } }, orderBy: { id: "asc" } },
    },
  });
  if (!r) throw new ErroNegocio("Vale não encontrado.");
  const h = r.local.hospital;
  if (!h) throw new ErroNegocio("O vale não é de um hospital.");
  if (r.status === "CANCELADA") throw new ErroNegocio(`O vale REM-${id} está cancelado.`);
  let itens: ItemEntrada[];
  let chaves = comp.chavesManuais;
  if (op === "REMESSA_CONSIGNACAO") {
    if (r.status === "CONFERIDA") throw new ErroNegocio(`O vale REM-${id} já foi conferido: a nota de remessa tem de sair antes do material.`);
    const precos = await precosHospital(c, h.tabelaPrecoId, r.itens.map((i) => i.produtoId));
    itens = r.itens.map((i) => ({ produto: i.produto as ProdutoFiscal, quantidade: i.quantidade, valorUnitario: precos.get(i.produtoId) ?? 0, lote: loteFiscal(i.lote) }));
  } else {
    if (r.status !== "CONFERIDA") throw new ErroNegocio(`O vale REM-${id} ainda não foi conferido: a devolução sai da conferência.`);
    const devolvidos = r.itens.filter((i) => i.devolvido > 0);
    if (devolvidos.length === 0) throw new ErroNegocio(`Nada foi devolvido no vale REM-${id}.`);
    const refs = await remessasAutorizadas(c, h.id, id);
    const precos = await precosHospital(c, h.tabelaPrecoId, devolvidos.map((i) => i.produtoId));
    itens = devolvidos.map((i) => {
      const ref = refs.find((x) => x.produtoId === i.produtoId && x.lote === i.lote.numero);
      return { produto: i.produto as ProdutoFiscal, quantidade: i.devolvido, valorUnitario: ref?.valor ?? precos.get(i.produtoId) ?? 0, lote: loteFiscal(i.lote) };
    });
    chaves = [...new Set([...refs.map((x) => x.chave), ...chaves])];
  }
  return {
    operacao: op,
    entrada: { operacao: op, destinatario: destHospital(h), itens, chavesReferenciadas: chaves, importacao: null, informacoes: [`Vale REM-${id}.`, comp.informacoes].filter(Boolean).join(" ") },
    vinculo: { hospitalId: h.id, fornecedorId: null, pedidoVendaId: null, remessaId: id, pedidoCompraId: null },
    vencimento: null,
    descricaoOrigem: `Vale REM-${id}`,
  };
}

async function lerPedidoVenda(c: Client, id: number, op: "VENDA" | "VENDA_CONSIGNADO" | "RETORNO_SIMBOLICO", comp: Complemento, agora: Date): Promise<OrigemLida> {
  const p = await c.pedidoVenda.findUnique({
    where: { id },
    include: { hospital: { select: HOSPITAL_DEST }, cirurgia: { select: { numero: true } }, itens: { include: { produto: { select: PRODUTO_FISCAL } }, orderBy: { id: "asc" } } },
  });
  if (!p) throw new ErroNegocio("Pedido de venda não encontrado.");
  if (p.status === "CANCELADO") throw new ErroNegocio(`O pedido PV-${id} está cancelado.`);
  if (op !== "RETORNO_SIMBOLICO" && p.status !== "ABERTO") throw new ErroNegocio(`O pedido PV-${id} já tem NF registrada (${p.numeroNf ?? "—"}).`);
  const lotes = await c.lote.findMany({
    where: { OR: p.itens.filter((i) => i.loteNumero).map((i) => ({ produtoId: i.produtoId, numero: i.loteNumero! })) },
    select: { produtoId: true, numero: true, fabricacao: true, validade: true },
  });
  const consignado = op !== "VENDA";
  const refs = consignado ? await remessasAutorizadas(c, p.hospitalId) : [];
  const itens: ItemEntrada[] = p.itens.map((i) => {
    const lote = lotes.find((l) => l.produtoId === i.produtoId && l.numero === i.loteNumero) ?? null;
    const ref = refs.find((x) => x.produtoId === i.produtoId && x.lote === i.loteNumero);
    // retorno simbólico devolve pelo valor da remessa; a venda sai pelo preço do pedido
    const valor = op === "RETORNO_SIMBOLICO" && ref ? ref.valor : toNumber(i.precoUnit);
    return { produto: i.produto as ProdutoFiscal, quantidade: i.quantidade, valorUnitario: valor, lote: loteFiscal(lote) };
  });
  const chaves = consignado ? [...new Set([...chavesDe(refs, p.itens.map((i) => ({ produtoId: i.produtoId, lote: i.loteNumero }))), ...comp.chavesManuais])] : comp.chavesManuais;
  const venc = new Date(diaBrasilia(agora).getTime() + (p.hospital.prazoPagamentoDias ?? 30) * 86_400_000);
  const inf = [`Pedido PV-${id}${p.cirurgia ? `, cirurgia CIR-${p.cirurgia.numero}` : ""}.`, comp.informacoes].filter(Boolean).join(" ");
  return {
    operacao: op,
    entrada: { operacao: op, destinatario: destHospital(p.hospital), itens, chavesReferenciadas: chaves, importacao: null, informacoes: inf },
    vinculo: { hospitalId: p.hospitalId, fornecedorId: null, pedidoVendaId: id, remessaId: null, pedidoCompraId: null },
    vencimento: op === "RETORNO_SIMBOLICO" ? null : venc,
    descricaoOrigem: `Pedido PV-${id}`,
  };
}

const DESPESA_NA_NOTA: Partial<Record<string, keyof ValoresImportacaoItem>> = {
  FRETE_INTERNACIONAL: "frete",
  SEGURO: "seguro",
  II: "ii",
  IPI: "ipi",
  PIS_IMPORTACAO: "pis",
  COFINS_IMPORTACAO: "cofins",
  ICMS: "icms",
};

async function lerImportacao(c: Client, id: number, comp: Complemento): Promise<OrigemLida> {
  const pc = await c.pedidoCompra.findUnique({
    where: { id },
    include: { fornecedor: { select: { id: true, razaoSocial: true } }, itens: { select: { id: true, produtoId: true, custoUnit: true, precoMoeda: true } }, despesas: true },
  });
  if (!pc) throw new ErroNegocio("Pedido de compra não encontrado.");
  if (!pc.importacao) throw new ErroNegocio(`O pedido PC-${id} não é de importação.`);
  if (pc.status !== "PARCIAL" && pc.status !== "RECEBIDO") throw new ErroNegocio(`O pedido PC-${id} ainda não foi recebido.`);
  if (!pc.numeroDi || !pc.dataRegistroDi || !pc.dataDesembaraco) throw new ErroNegocio(`Preencha número, data de registro da DI e data do desembaraço no pedido PC-${id} (Compras).`);
  if (!comp.importacao) throw new ErroNegocio("Informe os dados do desembaraço.");
  // Itens por lote recebido: as ENTRADAS do kardex com o documento do pedido.
  const entradas = await c.movimento.findMany({
    where: { documento: `PC-${id}`, tipo: "ENTRADA" },
    select: { produtoId: true, quantidade: true, lote: { select: { numero: true, fabricacao: true, validade: true } }, produto: { select: PRODUTO_FISCAL } },
    orderBy: { criadoEm: "asc" },
  });
  if (entradas.length === 0) throw new ErroNegocio(`Nenhuma entrada no estoque para o pedido PC-${id}.`);
  const cambio = pc.cambio ? toNumber(pc.cambio) : null;
  const unit = (produtoId: string) => {
    const it = pc.itens.find((i) => i.produtoId === produtoId);
    if (!it) return 0;
    return it.precoMoeda && cambio ? r2(toNumber(it.precoMoeda) * cambio * 10_000) / 10_000 : toNumber(it.custoUnit);
  };
  const itens: ItemEntrada[] = entradas.map((m) => ({ produto: m.produto as ProdutoFiscal, quantidade: m.quantidade, valorUnitario: unit(m.produtoId), lote: loteFiscal(m.lote), importacao: { frete: 0, seguro: 0, ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0, outros: 0 } }));
  const pesos = itens.map((i) => i.quantidade * i.valorUnitario);
  // Despesa de um item só (adição) rateia entre as linhas desse produto; as gerais, entre todas, pelo valor.
  for (const d of pc.despesas) {
    const campo = DESPESA_NA_NOTA[d.tipo];
    if (!campo) continue;
    const prodDoItem = d.itemId ? pc.itens.find((i) => i.id === d.itemId)?.produtoId : null;
    const p = pesos.map((w, k) => (prodDoItem && itens[k].produto.id !== prodDoItem ? 0 : w));
    ratear(toNumber(d.valor), p).forEach((v, k) => (itens[k].importacao![campo] = r2(itens[k].importacao![campo] + v)));
  }
  const afrmm = pc.despesas.filter((d) => d.tipo === "AFRMM").reduce((a, d) => a + toNumber(d.valor), 0);
  const imp = comp.importacao;
  return {
    operacao: "IMPORTACAO",
    entrada: {
      operacao: "IMPORTACAO",
      destinatario: { nome: pc.fornecedor.razaoSocial, documento: null, ie: null, endereco: "EXTERIOR", bairro: "EXTERIOR", cep: null, municipio: "EXTERIOR", uf: "EX", pais: imp.pais },
      itens,
      chavesReferenciadas: [],
      importacao: { ...imp, numeroDi: pc.numeroDi, dataDi: pc.dataRegistroDi, dataDesembaraco: pc.dataDesembaraco, valorAfrmm: r2(afrmm) },
      informacoes: [`Pedido de importação PC-${id}${pc.invoice ? `, invoice ${pc.invoice}` : ""}.`, comp.informacoes].filter(Boolean).join(" "),
    },
    vinculo: { hospitalId: null, fornecedorId: pc.fornecedor.id, pedidoVendaId: null, remessaId: null, pedidoCompraId: id },
    vencimento: null,
    descricaoOrigem: `Importação PC-${id}`,
  };
}

/** Qual operação cabe para a origem (a tela oferece só estas). */
export function operacoesDaOrigem(o: Origem["tipo"]): Operacao[] {
  if (o === "REMESSA") return ["REMESSA_CONSIGNACAO", "RETORNO_CONSIGNACAO"];
  if (o === "PEDIDO_VENDA") return ["VENDA_CONSIGNADO", "VENDA", "RETORNO_SIMBOLICO"];
  return ["IMPORTACAO"];
}

export async function lerOrigem(c: Client, origem: Origem, op: Operacao, comp: Complemento, agora = new Date()): Promise<OrigemLida> {
  if (!operacoesDaOrigem(origem.tipo).includes(op)) throw new ErroNegocio("Operação não cabe nesta origem.");
  if (origem.tipo === "REMESSA") return lerRemessa(c, origem.id, op as "REMESSA_CONSIGNACAO" | "RETORNO_CONSIGNACAO", comp);
  if (origem.tipo === "PEDIDO_VENDA") return lerPedidoVenda(c, origem.id, op as "VENDA" | "VENDA_CONSIGNADO" | "RETORNO_SIMBOLICO", comp, agora);
  return lerImportacao(c, origem.id, comp);
}

/** Operação sugerida: pedido de cirurgia (material consignado) → venda do consignado; pedido sem cirurgia → venda direta. */
export async function operacaoSugerida(c: Client, origem: Origem): Promise<Operacao> {
  if (origem.tipo === "PEDIDO_COMPRA") return "IMPORTACAO";
  if (origem.tipo === "REMESSA") {
    const r = await c.remessa.findUnique({ where: { id: origem.id }, select: { status: true } });
    return r?.status === "CONFERIDA" ? "RETORNO_CONSIGNACAO" : "REMESSA_CONSIGNACAO";
  }
  const p = await c.pedidoVenda.findUnique({ where: { id: origem.id }, select: { cirurgiaId: true } });
  return p?.cirurgiaId ? "VENDA_CONSIGNADO" : "VENDA";
}
