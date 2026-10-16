/**
 * SISPAG Itaú — remessa de pagamentos e leitura do retorno (CNAB 240).
 * Referência: manual "SISPAG — Layout de Arquivos — CNAB Versão 085" (out/2020).
 * Funções puras (sem banco de dados). Posições no código = posições do manual (1-based, inclusivas).
 *
 * Suportado: tipo de pagamento 20 (fornecedores) nas formas
 *   01 crédito em conta no Itaú · 41 TED outro titular · 45 Pix transferência por chave (segmentos A + B)
 *   30 boleto Itaú · 31 boleto de outros bancos (segmentos J + J-52)
 * Lotes Pix vão obrigatoriamente em arquivo separado das demais formas (item 2.2 do manual).
 */

import { ErroNegocio } from "@/lib/erros";
import { isCpfOrCnpj, tipoChavePix } from "@/lib/documentos-br";
import { lerBoleto } from "./boleto";

export class SispagError extends ErroNegocio {}

export type FormaSispag = "01" | "41" | "45" | "30" | "31";
export const FORMAS_SISPAG: Record<FormaSispag, string> = {
  "01": "Crédito em conta Itaú",
  "41": "TED",
  "45": "Pix",
  "30": "Boleto Itaú",
  "31": "Boleto outro banco",
};

export type Empresa = { cnpj: string; nome: string; agencia: string; conta: string; dac: string };

export type Favorecido = {
  nome: string;
  documento: string; // CPF (11) ou CNPJ (14), só dígitos
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  digito?: string | null;
  chavePix?: string | null;
};

export type Pagamento =
  | { forma: "01" | "41" | "45"; seuNumero: string; data: Date; valor: number; favorecido: Favorecido }
  | { forma: "30" | "31"; seuNumero: string; data: Date; valor: number; codigoBarras: string; vencimento: Date; valorTitulo: number; favorecido: Favorecido };

type PagBoleto = Extract<Pagamento, { forma: "30" | "31" }>;
type PagTransferencia = Extract<Pagamento, { forma: "01" | "41" | "45" }>;
const ehBoleto = (p: Pagamento): p is PagBoleto => p.forma === "30" || p.forma === "31";

// ───────────── formatação de campos ─────────────

const TAM = 240;

/** Alfanumérico: maiúsculas, sem acento nem caractere especial, alinhado à esquerda. */
export function alfa(v: string | null | undefined, tam: number) {
  const limpo = (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,/@\-+:]/g, " ");
  return limpo.padEnd(tam, " ").slice(0, tam);
}

/** Alfanumérico sem alterar caixa (chave Pix aleatória/e-mail). */
const alfaBruto = (v: string, tam: number) => v.padEnd(tam, " ").slice(0, tam);

/** Numérico: só dígitos, zeros à esquerda. Estoura se não couber (melhor erro que número truncado). */
export function num(v: string | number | null | undefined, tam: number) {
  const s = typeof v === "number" ? String(Math.round(v)) : (v ?? "").replace(/\D/g, "");
  if (s.length > tam) throw new SispagError(`Valor "${s}" não cabe em ${tam} dígitos.`);
  return s.padStart(tam, "0");
}

const valor = (reais: number, tam: number) => num(Math.round(reais * 100), tam);
const data = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;
const brancos = (tam: number) => " ".repeat(tam);
const zeros = (tam: number) => "0".repeat(tam);

/** Monta um registro a partir de [início, fim, conteúdo]; confere tamanhos e sobreposição. */
function reg(campos: [number, number, string][]): string {
  const a: (string | null)[] = Array(TAM).fill(null);
  for (const [ini, fim, v] of campos) {
    if (v.length !== fim - ini + 1) throw new SispagError(`Campo ${ini}-${fim} com ${v.length} caracteres (esperado ${fim - ini + 1}).`);
    for (let i = 0; i < v.length; i++) {
      if (a[ini - 1 + i] !== null) throw new SispagError(`Campo ${ini}-${fim} sobrepõe outro campo.`);
      a[ini - 1 + i] = v[i];
    }
  }
  const faltando = a.findIndex((c) => c === null);
  if (faltando >= 0) throw new SispagError(`Posição ${faltando + 1} não preenchida.`);
  return a.join("");
}

const docTipo = (doc: string) => (doc.replace(/\D/g, "").length === 11 ? "1" : "2");

/** Agência/conta do favorecido (nota 11), posições 024-043. */
function contaFavorecido(p: { forma: FormaSispag; favorecido: Favorecido }): string {
  const f = p.favorecido;
  if (p.forma === "45") return brancos(20); // Pix por chave: dados bancários opcionais
  const dig = (f.digito ?? "").trim();
  if (!f.agencia || !f.conta || !dig) throw new SispagError(`Fornecedor ${f.nome} sem agência/conta/dígito cadastrados.`);
  if (p.forma === "01") {
    // nota 11a: DAC Itaú é 9(01); "X" viraria "0" em silêncio
    if (!/^\d$/.test(dig)) throw new SispagError(`Conta Itaú de ${f.nome}: o dígito deve ser 1 número.`);
    return "0" + num(f.agencia, 4) + " " + "000000" + num(f.conta, 6) + " " + num(dig, 1);
  }
  // 41 TED: agência(5) branco conta(12) [branco|1º dígito] dígito
  return num(f.agencia, 5) + " " + num(f.conta, 12) + (dig.length === 2 ? alfa(dig, 2) : " " + alfa(dig, 1));
}

function headerArquivo(e: Empresa, instante: Date) {
  // data e hora de geração em Brasília (UTC-3, sem horário de verão): depois das 21h o dia UTC já é o seguinte
  const agora = new Date(instante.getTime() - 3 * 60 * 60 * 1000);
  const hora = `${String(agora.getUTCHours()).padStart(2, "0")}${String(agora.getUTCMinutes()).padStart(2, "0")}${String(agora.getUTCSeconds()).padStart(2, "0")}`;
  return reg([
    [1, 3, "341"], [4, 7, "0000"], [8, 8, "0"], [9, 14, brancos(6)], [15, 17, "080"],
    [18, 18, docTipo(e.cnpj)], [19, 32, num(e.cnpj, 14)], [33, 52, brancos(20)],
    [53, 57, num(e.agencia, 5)], [58, 58, " "], [59, 70, num(e.conta, 12)], [71, 71, " "], [72, 72, num(e.dac, 1)],
    [73, 102, alfa(e.nome, 30)], [103, 132, alfa("BANCO ITAU SA", 30)], [133, 142, brancos(10)],
    [143, 143, "1"], [144, 151, data(agora)], [152, 157, hora], [158, 166, zeros(9)], [167, 171, zeros(5)], [172, 240, brancos(69)],
  ]);
}

function headerLote(e: Empresa, lote: number, forma: FormaSispag) {
  return reg([
    [1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "1"], [9, 9, "C"], [10, 11, "20"], [12, 13, forma],
    [14, 16, forma === "30" || forma === "31" ? "030" : "040"], [17, 17, " "],
    [18, 18, docTipo(e.cnpj)], [19, 32, num(e.cnpj, 14)], [33, 52, brancos(20)],
    [53, 57, num(e.agencia, 5)], [58, 58, " "], [59, 70, num(e.conta, 12)], [71, 71, " "], [72, 72, num(e.dac, 1)],
    [73, 102, alfa(e.nome, 30)], [103, 132, brancos(30)], [133, 142, brancos(10)],
    [143, 172, brancos(30)], [173, 177, zeros(5)], [178, 192, brancos(15)], [193, 212, brancos(20)], [213, 220, zeros(8)], [221, 222, brancos(2)],
    [223, 230, brancos(8)], [231, 240, brancos(10)],
  ]);
}

function segmentoA(lote: number, n: number, p: Extract<Pagamento, { forma: "01" | "41" | "45" }>) {
  const f = p.favorecido;
  // TED (41) vai para outro banco: código de 3 dígitos, nem zeros nem 341 (Itaú é crédito em conta, forma 01; nota 11b)
  if (p.forma === "41" && (!/^\d{3}$/.test(f.banco ?? "") || f.banco === "000" || f.banco === "341")) {
    throw new SispagError(`TED para ${f.nome}: código do banco favorecido inválido ("${f.banco ?? ""}").`);
  }
  return reg([
    [1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "3"], [9, 13, num(n, 5)], [14, 14, "A"], [15, 17, "000"],
    [18, 20, p.forma === "45" ? "009" : "000"],
    [21, 23, p.forma === "45" ? zeros(3) : p.forma === "01" ? "341" : num(f.banco, 3)],
    [24, 43, contaFavorecido(p)], [44, 73, alfa(f.nome, 30)], [74, 93, alfa(p.seuNumero, 20)],
    [94, 101, data(p.data)], [102, 104, "REA"], [105, 112, brancos(8)],
    [113, 114, p.forma === "45" ? "04" : brancos(2)], [115, 119, zeros(5)], [120, 134, valor(p.valor, 15)],
    [135, 149, brancos(15)], [150, 154, brancos(5)], [155, 162, zeros(8)], [163, 177, zeros(15)],
    [178, 197, brancos(20)], [198, 203, zeros(6)], [204, 217, num(f.documento, 14)], [218, 219, brancos(2)],
    [220, 224, p.forma === "41" ? "00005" : brancos(5)], [225, 229, brancos(5)], [230, 230, "0"], [231, 240, brancos(10)],
  ]);
}

/** Segmento B: na forma Pix leva a chave; nas demais confirma CPF x CNPJ (nota 15). */
function segmentoB(lote: number, n: number, p: Extract<Pagamento, { forma: "01" | "41" | "45" }>) {
  const f = p.favorecido;
  const base: [number, number, string][] = [[1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "3"], [9, 13, num(n, 5)], [14, 14, "B"]];
  if (p.forma === "45") {
    const chave = (f.chavePix ?? "").trim();
    if (!chave) throw new SispagError(`Fornecedor ${f.nome} sem chave Pix cadastrada.`);
    const tipo = tipoChavePix(chave);
    // nota 40: a chave vai como está (e-mail/aleatória sem mudar caixa); só ASCII visível, sem espaço nem acento
    if (!/^[\x21-\x7E]+$/.test(chave)) throw new SispagError(`Chave Pix de ${f.nome} com espaço, acento ou caractere inválido.`);
    return reg([
      ...base, [15, 16, tipo], [17, 17, " "], [18, 18, docTipo(f.documento)], [19, 32, num(f.documento, 14)],
      [33, 62, brancos(30)], [63, 127, zeros(65)], [128, 227, tipo === "02" || tipo === "04" ? alfaBruto(chave, 100) : alfa(chave, 100)],
      [228, 230, brancos(3)], [231, 240, brancos(10)],
    ]);
  }
  return reg([
    ...base, [15, 17, brancos(3)], [18, 18, docTipo(f.documento)], [19, 32, num(f.documento, 14)],
    [33, 62, brancos(30)], [63, 67, zeros(5)], [68, 82, brancos(15)], [83, 97, brancos(15)], [98, 117, brancos(20)],
    [118, 125, zeros(8)], [126, 127, brancos(2)], [128, 227, brancos(100)], [228, 230, brancos(3)], [231, 240, brancos(10)],
  ]);
}

function segmentoJ(lote: number, n: number, p: Extract<Pagamento, { forma: "30" | "31" }>) {
  if (!/^\d{44}$/.test(p.codigoBarras)) throw new SispagError(`Código de barras inválido para ${p.favorecido.nome}.`);
  lerBoleto(p.codigoBarras); // Anexo A: DV geral (módulo 11), moeda 9 e não é concessionária/tributo (segmento O)
  // nota 5: 30 = título em cobrança no Itaú (banco 341 no código de barras); 31 = outros bancos
  if ((p.forma === "30") !== p.codigoBarras.startsWith("341")) throw new SispagError(`Boleto de ${p.favorecido.nome}: forma ${p.forma} não corresponde ao banco ${p.codigoBarras.slice(0, 3)} do código de barras.`);
  return reg([
    [1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "3"], [9, 13, num(n, 5)], [14, 14, "J"], [15, 17, "000"],
    [18, 61, p.codigoBarras], // banco, moeda, DV, fator, valor e campo livre: mesma ordem do código de barras
    [62, 91, alfa(p.favorecido.nome, 30)], [92, 99, data(p.vencimento)], [100, 114, valor(p.valorTitulo, 15)],
    [115, 129, zeros(15)], [130, 144, zeros(15)], [145, 152, data(p.data)], [153, 167, valor(p.valor, 15)],
    [168, 182, zeros(15)], [183, 202, alfa(p.seuNumero, 20)], [203, 215, brancos(13)], [216, 230, brancos(15)], [231, 240, brancos(10)],
  ]);
}

function segmentoJ52(lote: number, n: number, e: Empresa, p: Extract<Pagamento, { forma: "30" | "31" }>) {
  const f = p.favorecido;
  return reg([
    [1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "3"], [9, 13, num(n, 5)], [14, 14, "J"], [15, 17, "000"], [18, 19, "52"],
    [20, 20, docTipo(e.cnpj)], [21, 35, num(e.cnpj, 15)], [36, 75, alfa(e.nome, 40)],
    [76, 76, docTipo(f.documento)], [77, 91, num(f.documento, 15)], [92, 131, alfa(f.nome, 40)],
    [132, 132, "0"], [133, 147, zeros(15)], [148, 187, brancos(40)], [188, 240, brancos(53)],
  ]);
}

function trailerLote(lote: number, qtd: number, total: number) {
  return reg([[1, 3, "341"], [4, 7, num(lote, 4)], [8, 8, "5"], [9, 17, brancos(9)], [18, 23, num(qtd, 6)], [24, 41, valor(total, 18)], [42, 59, zeros(18)], [60, 230, brancos(171)], [231, 240, brancos(10)]]);
}

function trailerArquivo(lotes: number, registros: number) {
  return reg([[1, 3, "341"], [4, 7, "9999"], [8, 8, "9"], [9, 17, brancos(9)], [18, 23, num(lotes, 6)], [24, 29, num(registros, 6)], [30, 240, brancos(211)]]);
}

/** Gera o arquivo de remessa (linhas de 240 posições separadas por CRLF). */
export function gerarRemessaSispag(empresa: Empresa, pagamentos: Pagamento[], agora: Date): string {
  if (pagamentos.length === 0) throw new SispagError("Nenhum pagamento na remessa.");
  const temPix = pagamentos.some((p) => p.forma === "45");
  if (temPix && pagamentos.some((p) => p.forma !== "45")) throw new SispagError("Pagamentos Pix precisam ir em arquivo separado das demais formas.");
  // nota 1 / nota 15: CPF/CNPJ com dígito verificador errado volta rejeitado (CI/BI); melhor recusar aqui
  if (!isCpfOrCnpj(empresa.cnpj)) throw new SispagError("CNPJ/CPF do titular da conta a debitar inválido (dígito verificador). Corrija na conta bancária.");
  for (const p of pagamentos) {
    if (!(p.valor > 0)) throw new SispagError(`Valor inválido para ${p.favorecido.nome}.`);
    const doc = p.favorecido.documento.replace(/\D/g, "");
    if (!isCpfOrCnpj(doc)) throw new SispagError(`CPF/CNPJ do favorecido ${p.favorecido.nome} inválido (tamanho ou dígito verificador). Corrija no cadastro do fornecedor.`);
    if (!alfa(p.favorecido.nome, 30).trim()) throw new SispagError("Favorecido sem nome (ocorrência AO no banco).");
  }

  const linhas = [headerArquivo(empresa, agora)];
  const ordem: FormaSispag[] = ["01", "41", "45", "30", "31"];
  let lote = 0;
  for (const forma of ordem) {
    const doLote = pagamentos.filter((p) => p.forma === forma);
    if (doLote.length === 0) continue;
    lote++;
    const corpo: string[] = [];
    doLote.forEach((p, i) => {
      const n = i + 1;
      if (ehBoleto(p)) corpo.push(segmentoJ(lote, n, p), segmentoJ52(lote, n, empresa, p));
      else corpo.push(segmentoA(lote, n, p as PagTransferencia), segmentoB(lote, n, p as PagTransferencia));
    });
    const total = doLote.reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100;
    linhas.push(headerLote(empresa, lote, forma), ...corpo, trailerLote(lote, corpo.length + 2, total));
  }
  linhas.push(trailerArquivo(lote, linhas.length + 1));
  return linhas.join("\r\n") + "\r\n";
}

// ───────────── retorno ─────────────

export type ResultadoPagamento = {
  seuNumero: string;
  segmento: "A" | "J";
  ocorrencias: string[];
  nossoNumero: string;
  dataEfetiva: Date | null;
  valorEfetivo: number;
};

const campo = (l: string, ini: number, fim: number) => l.slice(ini - 1, fim);

function dataRet(s: string): Date | null {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m || s === "00000000") return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

const ocorr = (s: string) => (s.match(/.{1,2}/g) ?? []).map((c) => c.trim()).filter(Boolean);

/** Agência, conta e DAC da empresa no header do arquivo (posições 53-57, 59-70 e 72), sem zeros à esquerda. */
export function contaDoRetorno(texto: string) {
  const h = (texto.split(/\r?\n/)[0] ?? "").padEnd(TAM, " ");
  const n = (v: string) => v.trim().replace(/^0+/, "");
  return { agencia: n(campo(h, 53, 57)), conta: n(campo(h, 59, 70)), dac: campo(h, 72, 72).trim() };
}

/**
 * Lê o arquivo de retorno do SISPAG e devolve o resultado de cada pagamento (segmentos A e J).
 * Segmentos B, C, Z e J-52 são complementos (nota 9: mesmo número do A/J) e são ignorados.
 */
export function lerRetornoSispag(texto: string): ResultadoPagamento[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) throw new SispagError("Arquivo vazio ou incompleto.");
  const h = linhas[0].padEnd(TAM, " ");
  if (campo(h, 1, 3) !== "341" || campo(h, 8, 8) !== "0") throw new SispagError("Não é um arquivo SISPAG do Itaú (header inválido).");
  if (campo(h, 143, 143) !== "2") throw new SispagError("Este arquivo é uma remessa, não um retorno do banco.");

  const out: ResultadoPagamento[] = [];
  let ocorrLote: string[] = [];
  let inicioLote = 0;
  let ultimoJ = "";
  for (const [i, bruta] of linhas.entries()) {
    if (bruta.length > TAM) throw new SispagError(`Linha ${i + 1} com mais de 240 caracteres.`);
    const l = bruta.padEnd(TAM, " ");
    const tipo = campo(l, 8, 8);
    if (tipo === "1") {
      ocorrLote = ocorr(campo(l, 231, 240));
      inicioLote = out.length;
      ultimoJ = "";
      continue;
    }
    if (tipo === "5") {
      // ocorrência no trailer de lote (ex.: TA, totais com diferença) vale para os pagamentos do lote sem ocorrência própria
      const t = ocorr(campo(l, 231, 240));
      if (t.length) for (const r of out.slice(inicioLote)) if (r.ocorrencias.length === 0) r.ocorrencias = t;
      continue;
    }
    if (tipo !== "3") continue;
    const seg = campo(l, 14, 14);
    const nReg = campo(l, 9, 13);
    if (seg === "A") {
      const o = ocorr(campo(l, 231, 240));
      out.push({
        seuNumero: campo(l, 74, 93).trim(),
        segmento: "A",
        ocorrencias: o.length ? o : ocorrLote,
        nossoNumero: campo(l, 135, 149).trim(),
        dataEfetiva: dataRet(campo(l, 155, 162)),
        valorEfetivo: Number(campo(l, 163, 177)) / 100 || 0,
      });
    } else if (seg === "J") {
      if (nReg === ultimoJ) continue; // J-52 (complemento): mesmo número de registro do J anterior
      ultimoJ = nReg;
      const o = ocorr(campo(l, 231, 240));
      out.push({
        seuNumero: campo(l, 183, 202).trim(),
        segmento: "J",
        ocorrencias: o.length ? o : ocorrLote,
        nossoNumero: campo(l, 216, 230).trim(),
        dataEfetiva: dataRet(campo(l, 145, 152)),
        valorEfetivo: Number(campo(l, 153, 167)) / 100 || 0,
      });
    }
  }
  return out;
}

export { OCORRENCIAS, descreverOcorrencias, foiDevolvido, situacaoRetorno } from "./sispag-ocorrencias";
