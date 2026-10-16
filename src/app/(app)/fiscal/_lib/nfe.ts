/**
 * Montagem da NF-e (pura, sem banco nem emissor): recebe os dados da origem (pedido de venda, vale, pedido de importação)
 * já lidos e devolve a nota com CFOP, CST, tributos, rastro de lote e totais, mais a lista de erros (impedem o envio) e
 * de avisos (o usuário vê antes de enviar). Regras fiscais em ./nfe-regras.ts; fundamento em docs/NFE.md.
 */
import { isCnpj, isCpf, onlyDigits, UFS } from "@/lib/documentos-br";
import {
  REGRAS,
  cfopDaOperacao,
  cstDoItem,
  destinoOperacao,
  enquadramentoDoNcm,
  type Cst,
  type Enquadramento,
  type Operacao,
} from "./nfe-regras";

export type Destinatario = {
  nome: string;
  /** CNPJ ou CPF (com ou sem máscara); nulo para estrangeiro. */
  documento: string | null;
  ie: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  /** "EX" para exterior. */
  uf: string;
  pais: string | null;
  email?: string | null;
};

export type ProdutoFiscal = {
  id: string;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  gtin: string | null;
  unidade: string;
  unidadeTributavel: string | null;
  origem: number;
  registroAnvisa: string | null;
  controlaLote: boolean;
};

export type LoteFiscal = { numero: string; fabricacao: Date | null; validade: Date | null };

/** Valores da importação já rateados para o item (R$). */
export type ValoresImportacaoItem = { frete: number; seguro: number; ii: number; ipi: number; pis: number; cofins: number; icms: number; outros: number };

export type ItemEntrada = {
  produto: ProdutoFiscal;
  quantidade: number;
  valorUnitario: number;
  lote: LoteFiscal | null;
  importacao?: ValoresImportacaoItem;
};

export type DadosImportacao = {
  numeroDi: string;
  dataDi: Date;
  localDesembaraco: string;
  ufDesembaraco: string;
  dataDesembaraco: Date;
  /** tpViaTransp: 1 marítima, 4 aérea, 7 rodoviária… */
  viaTransporte: number;
  valorAfrmm: number;
  /** tpIntermedio: 1 por conta própria, 2 por conta e ordem, 3 encomenda. */
  intermediacao: 1 | 2 | 3;
  adicao: number;
  codigoFabricante: string;
};

export type EntradaNfe = {
  operacao: Operacao;
  destinatario: Destinatario;
  itens: ItemEntrada[];
  chavesReferenciadas: string[];
  importacao: DadosImportacao | null;
  informacoes: string | null;
  /** Tabela de enquadramento por NCM (padrão: ENQUADRAMENTO_PADRAO). */
  enquadramentos?: Record<string, Enquadramento>;
};

export type ItemNfe = {
  numeroItem: number;
  produtoId: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cest: string | null;
  gtin: string | null;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  origem: number;
  cst: Cst;
  cBenef: string | null;
  baseIcms: number;
  valorIcms: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  valorII: number;
  frete: number;
  seguro: number;
  outros: number;
  lote: LoteFiscal | null;
  registroAnvisa: string | null;
};

export type Totais = { produtos: number; frete: number; seguro: number; outros: number; ii: number; ipi: number; baseIcms: number; icms: number; pis: number; cofins: number; total: number };

export type Nfe = {
  operacao: Operacao;
  entrada: boolean;
  natureza: string;
  cfop: string;
  finalidade: 1 | 4;
  idDest: 1 | 2 | 3;
  /** indFinal: 1 consumidor final (hospital usa o material), 0 normal (revenda, importação). */
  indFinal: 0 | 1;
  /** indIEDest: 1 contribuinte, 2 isento de IE, 9 não contribuinte. */
  indIEDest: 1 | 2 | 9;
  destinatario: Destinatario;
  itens: ItemNfe[];
  totais: Totais;
  chavesReferenciadas: string[];
  importacao: DadosImportacao | null;
  informacoes: string | null;
};

export type Montagem = { nfe: Nfe; erros: string[]; avisos: string[] };

export const MAX_ITENS = 990;

/** Arredonda para centavos (meio para cima, sem o erro de ponto flutuante de 1.005). */
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Divide `total` em parcelas proporcionais a `pesos`, em centavos, somando exatamente o total (maior resto). */
export function ratear(total: number, pesos: number[]): number[] {
  const centavos = Math.round(total * 100);
  const soma = pesos.reduce((a, p) => a + Math.max(0, p), 0);
  if (pesos.length === 0) return [];
  if (soma <= 0) {
    const out = pesos.map(() => Math.floor(centavos / pesos.length));
    for (let i = 0; i < centavos - out.reduce((a, b) => a + b, 0); i++) out[i] += 1;
    return out.map((c) => c / 100);
  }
  const brutos = pesos.map((p) => (centavos * Math.max(0, p)) / soma);
  const base = brutos.map(Math.floor);
  let falta = centavos - base.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; falta > 0; k = (k + 1) % ordem.length, falta--) base[ordem[k].i] += 1;
  return base.map((c) => c / 100);
}

// ───────────────────────── chave de acesso ─────────────────────────

/** Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0). MOC, item 5.4. */
export function dvChave(chave43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && dvChave(chave.slice(0, 43)) === Number(chave[43]);
}

/** cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1). */
export function montarChave(p: { cUF: number; emissao: Date; cnpj: string; serie: number; numero: number; tpEmis?: number; codigo: number }): string {
  const aamm = `${String(p.emissao.getUTCFullYear()).slice(2)}${String(p.emissao.getUTCMonth() + 1).padStart(2, "0")}`;
  const c43 = `${String(p.cUF).padStart(2, "0")}${aamm}${onlyDigits(p.cnpj).padStart(14, "0")}55${String(p.serie).padStart(3, "0")}${String(p.numero).padStart(9, "0")}${p.tpEmis ?? 1}${String(p.codigo).padStart(8, "0")}`;
  return c43 + dvChave(c43);
}

// ───────────────────────── montagem ─────────────────────────

function validarDestinatario(op: Operacao, d: Destinatario, erros: string[], avisos: string[]) {
  if (!d.nome.trim()) erros.push("Destinatário sem nome.");
  if (op === "IMPORTACAO") {
    if (d.uf !== "EX") erros.push("Na NF de importação o destinatário (fornecedor estrangeiro) deve ter UF EX.");
    if (!d.pais) erros.push("Informe o país do fornecedor estrangeiro.");
    return;
  }
  const doc = onlyDigits(d.documento ?? "");
  if (!(doc.length === 14 ? isCnpj(doc) : doc.length === 11 && isCpf(doc))) erros.push(`CNPJ/CPF do destinatário inválido (${d.documento ?? "vazio"}).`);
  if (!(UFS as readonly string[]).includes(d.uf.toUpperCase())) erros.push(`UF do destinatário inválida (${d.uf || "vazia"}).`);
  if (!d.municipio) erros.push("Município do destinatário não informado (cadastro).");
  if (!d.endereco) erros.push("Endereço do destinatário não informado (cadastro).");
  if (!/^\d{8}$/.test(onlyDigits(d.cep ?? ""))) erros.push("CEP do destinatário inválido (cadastro).");
  if (!d.bairro) avisos.push("Bairro do destinatário vazio: alguns emissores recusam.");
}

function validarItem(e: EntradaNfe, it: ItemEntrada, n: number, erros: string[], avisos: string[]) {
  const p = it.produto;
  const rot = `Item ${n} (${p.codigo})`;
  if (!/^\d{8}$/.test(onlyDigits(p.ncm ?? ""))) erros.push(`${rot}: NCM ausente ou inválido no cadastro do produto (8 dígitos).`);
  if (p.cest && !/^\d{7}$/.test(onlyDigits(p.cest))) erros.push(`${rot}: CEST inválido (7 dígitos).`);
  if (p.gtin && !/^(\d{8}|\d{12,14})$/.test(p.gtin)) avisos.push(`${rot}: GTIN fora do formato; a nota sai com "SEM GTIN".`);
  if (!Number.isInteger(it.quantidade) || it.quantidade <= 0) erros.push(`${rot}: quantidade inválida.`);
  if (!(it.valorUnitario > 0)) erros.push(`${rot}: valor unitário zerado (confira a tabela de preço ou o custo).`);
  if (p.origem < 0 || p.origem > 8) erros.push(`${rot}: origem da mercadoria inválida.`);
  if (e.operacao === "IMPORTACAO" && p.origem !== 1) avisos.push(`${rot}: produto importado com origem ${p.origem} no cadastro; na importação direta a origem é 1.`);
  // Rastro (grupo I80): produto controlado por lote leva lote, quantidade, fabricação e validade (docs/NFE.md §4).
  if (p.controlaLote) {
    if (!it.lote) erros.push(`${rot}: produto controlado por lote sem lote informado.`);
    else {
      if (!it.lote.validade) erros.push(`${rot}: lote ${it.lote.numero} sem validade.`);
      if (!it.lote.fabricacao) erros.push(`${rot}: lote ${it.lote.numero} sem data de fabricação (obrigatória no grupo rastro da NF-e). Complete o lote na Qualidade.`);
    }
  }
  if (!p.registroAnvisa) avisos.push(`${rot}: produto sem registro ANVISA no cadastro.`);
}

export function montarNfe(e: EntradaNfe): Montagem {
  const erros: string[] = [];
  const avisos: string[] = [];
  const regra = REGRAS[e.operacao];
  const d = e.destinatario;
  const uf = d.uf.toUpperCase();
  validarDestinatario(e.operacao, d, erros, avisos);
  if (e.itens.length === 0) erros.push("A nota não tem itens.");
  if (e.itens.length > MAX_ITENS) erros.push(`A NF-e aceita no máximo ${MAX_ITENS} itens; divida a operação.`);

  const chaves = [...new Set(e.chavesReferenciadas.map((c) => onlyDigits(c)))];
  for (const c of chaves) if (!chaveValida(c)) erros.push(`Chave referenciada inválida: ${c}.`);
  if (regra.exigeReferencia && chaves.length === 0) erros.push(`${regra.rotulo}: informe a chave da NF de remessa em consignação (autorizada) que esta nota referencia.`);

  if (e.operacao === "IMPORTACAO") {
    const di = e.importacao;
    if (!di) erros.push("Dados da DI ausentes.");
    else {
      if (!di.numeroDi.trim()) erros.push("Número da DI/DUIMP ausente.");
      if (!di.localDesembaraco.trim()) erros.push("Local do desembaraço ausente.");
      if (!(UFS as readonly string[]).includes(di.ufDesembaraco.toUpperCase())) erros.push("UF do desembaraço inválida.");
      if (!(di.adicao >= 1 && di.adicao <= 999)) erros.push("Número da adição inválido.");
      if (di.viaTransporte === 1 && !(di.valorAfrmm > 0)) avisos.push("Via marítima sem AFRMM informado.");
      if (!di.codigoFabricante.trim()) erros.push("Código do fabricante estrangeiro ausente.");
    }
  }

  const idDest = destinoOperacao(e.operacao, uf);
  const contribuinte = !!d.ie && onlyDigits(d.ie).length > 0;
  const indIEDest: 1 | 2 | 9 = e.operacao === "IMPORTACAO" ? 9 : contribuinte ? 1 : 9;
  // Hospital consome o material no paciente: consumidor final. Importação e notas de entrada própria: operação normal.
  const indFinal: 0 | 1 = regra.entrada ? 0 : 1;
  const cfop = cfopDaOperacao(e.operacao, uf);

  const naoConfirmados = new Set<string>();
  const itens: ItemNfe[] = e.itens.map((it, idx) => {
    validarItem(e, it, idx + 1, erros, avisos);
    const p = it.produto;
    const ncm = onlyDigits(p.ncm ?? "");
    const { e: enq, confirmado } = enquadramentoDoNcm(ncm, e.enquadramentos);
    if (!confirmado && ncm) naoConfirmados.add(ncm);
    const cst = cstDoItem(e.operacao, enq, p.origem, uf);
    const valorTotal = r2(it.quantidade * it.valorUnitario);
    const imp = it.importacao ?? { frete: 0, seguro: 0, ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0, outros: 0 };
    let baseIcms = 0;
    let valorIcms = 0;
    let valorIpi = 0;
    let valorPis = 0;
    let valorCofins = 0;
    let outros = 0;
    if (e.operacao === "IMPORTACAO") {
      // Na importação os tributos já foram apurados no desembaraço (DI): a nota reproduz o que foi pago.
      valorIpi = imp.ipi;
      valorIcms = cst.icms === "00" ? imp.icms : 0;
      baseIcms = valorIcms > 0 && cst.aliqIcms > 0 ? r2(valorIcms / (cst.aliqIcms / 100)) : 0;
      if (cst.icms === "40" && imp.icms > 0) avisos.push(`Item ${idx + 1}: ICMS da importação informado, mas o NCM está como isento; confira com o contador.`);
      outros = r2(imp.pis + imp.cofins + imp.outros);
    } else {
      valorIpi = r2(valorTotal * (cst.aliqIpi / 100));
      if (cst.icms === "00") {
        // IPI integra a base do ICMS quando o destinatário é consumidor final (CF/88, art. 155, §2º, XI).
        baseIcms = r2(valorTotal + (indFinal === 1 ? valorIpi : 0));
        valorIcms = r2(baseIcms * (cst.aliqIcms / 100));
      }
      valorPis = r2(valorTotal * (cst.aliqPis / 100));
      valorCofins = r2(valorTotal * (cst.aliqCofins / 100));
    }
    return {
      numeroItem: idx + 1,
      produtoId: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      ncm,
      cest: p.cest ? onlyDigits(p.cest) : null,
      gtin: p.gtin && /^(\d{8}|\d{12,14})$/.test(p.gtin) ? p.gtin : null,
      cfop,
      unidade: (p.unidadeTributavel || p.unidade || "UN").toUpperCase().slice(0, 6),
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal,
      origem: p.origem,
      cst,
      cBenef: cst.icms === "40" ? enq.cBenef : null,
      baseIcms,
      valorIcms,
      valorIpi,
      valorPis,
      valorCofins,
      valorII: e.operacao === "IMPORTACAO" ? imp.ii : 0,
      frete: e.operacao === "IMPORTACAO" ? imp.frete : 0,
      seguro: e.operacao === "IMPORTACAO" ? imp.seguro : 0,
      outros,
      lote: it.lote,
      registroAnvisa: p.registroAnvisa,
    };
  });
  if (naoConfirmados.size) avisos.push(`NCM sem enquadramento padrão (sai tributado, ICMS ${idDest === 2 ? "interestadual" : "18%"}): ${[...naoConfirmados].join(", ")}. Confirme com o contador.`);
  if (idDest === 2 && indIEDest === 9 && itens.some((i) => i.cst.icms === "00"))
    avisos.push("Venda interestadual a não contribuinte com ICMS tributado: o diferencial de alíquota (DIFAL, EC 87/2015) não é calculado pelo sistema. Confirme com o contador antes de emitir.");

  const soma = (f: (i: ItemNfe) => number) => r2(itens.reduce((a, i) => a + f(i), 0));
  const t: Totais = {
    produtos: soma((i) => i.valorTotal),
    frete: soma((i) => i.frete),
    seguro: soma((i) => i.seguro),
    outros: soma((i) => i.outros),
    ii: soma((i) => i.valorII),
    ipi: soma((i) => i.valorIpi),
    baseIcms: soma((i) => i.baseIcms),
    icms: soma((i) => i.valorIcms),
    pis: soma((i) => i.valorPis),
    cofins: soma((i) => i.valorCofins),
    total: 0,
  };
  // vNF (MOC, regra W16): vProd − vDesc − vICMSDeson + vST + vFCPST + vFrete + vSeg + vOutro + vII + vIPI + vIPIDevol + vServ.
  t.total = r2(t.produtos + t.frete + t.seguro + t.outros + t.ii + t.ipi);
  if (itens.length && !(t.total > 0)) erros.push("O valor total da nota é zero.");

  const informacoes = [
    e.informacoes?.trim(),
    itens.some((i) => i.cst.icms === "40") ? "ICMS isento nos itens com CST 40, conforme Convênio ICMS 01/99 (confirmar dispositivo do RICMS/SP com o contador)." : null,
  ]
    .filter(Boolean)
    .join(" ") || null;

  return {
    nfe: {
      operacao: e.operacao,
      entrada: regra.entrada,
      natureza: regra.natureza,
      cfop,
      finalidade: regra.finalidade,
      idDest,
      indFinal,
      indIEDest,
      destinatario: { ...d, uf, documento: d.documento ? onlyDigits(d.documento) : null, cep: d.cep ? onlyDigits(d.cep) : null },
      itens,
      totais: t,
      chavesReferenciadas: chaves,
      importacao: e.importacao,
      informacoes,
    },
    erros: [...new Set(erros)],
    avisos: [...new Set(avisos)],
  };
}
