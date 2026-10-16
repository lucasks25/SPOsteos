/**
 * Cobrança Itaú — remessa de boletos registrados, leitura do retorno e código de barras (CNAB 400).
 * Referência: manual Itaú "Cobrança Bancária — Layout de Arquivos CNAB 400" (jan/2017, download.itau.com.br).
 * Funções puras (sem banco de dados). Posições no código = posições do manual (1-based, inclusivas).
 * Valores SEMPRE em centavos (inteiros).
 *
 * Carteira suportada: 109 — "direta eletrônica sem emissão - simples" (nota 5): o Itaú registra,
 * a empresa imprime o boleto e escolhe o nosso número (nota 3: livre, sem repetir enquanto registrado
 * ou até 45 dias após baixa/liquidação). Código da carteira (posição 108) = "I". DAC do nosso número
 * por agência + conta + carteira + nosso número (nota 23 / anexo 4). As escriturais (112, 104...)
 * são impressas pelo Itaú e as de 15 posições (anexo 5) têm outro código de barras: fora do escopo.
 *
 * Ocorrências de remessa (nota 6): 01 entrada, 02 pedido de baixa, 06 alteração de vencimento.
 */

import { ErroNegocio } from "@/lib/erros";
import { dvBarras, fatorDoVencimento, lerBoleto, linhaDigitavel as linhaDigitavelBoleto, mod10 } from "./boleto";
import { CODIGOS_LIQUIDACAO, ESPECIES, INSTRUCOES_CANCELADAS, MOTIVOS_POR_OCORRENCIA, OCORRENCIAS_RETORNO, UFS } from "./cobranca-tabelas";
import { diaBrasilia } from "@/lib/datas";

export class CobrancaError extends ErroNegocio {}

export const CARTEIRAS_COBRANCA = { "109": "I" } as const;
export type CarteiraCobranca = keyof typeof CARTEIRAS_COBRANCA;

export type Beneficiario = { agencia: string; conta: string; dac: string; nome: string; cnpj: string; carteira: CarteiraCobranca };

export type Pagador = { nome: string; documento: string; logradouro: string; bairro: string; cep: string; cidade: string; uf: string };

/** Ocorrência 01 — entrada de título. */
export type EntradaTitulo = {
  ocorrencia: "01";
  nossoNumero: string; // até 8 dígitos, sem DAC
  seuNumero: string; // nº do documento (nota 18), até 10 caracteres; vai impresso no boleto
  usoEmpresa?: string; // identificação livre (nota 2), até 25 caracteres; volta igual no retorno
  emissao: Date;
  vencimento: Date;
  valorCentavos: number;
  especie?: string; // nota 10; padrão "01" duplicata mercantil
  aceite?: "A" | "N"; // padrão "N"
  jurosDiaCentavos?: number; // posições 161-173 (nota 12); vazio = padrão cadastrado na conta
  desconto?: { ate: Date; valorCentavos: number };
  multa?: { percentualCentesimos: number; data?: Date } | { valorCentavos: number; data?: Date }; // registro tipo 2 (nota 35)
  instrucoes?: [string] | [string, string]; // nota 11, códigos de 2 dígitos
  prazoDias?: number; // posições 392-393 (instruções 09/34/35/66/91/92)
  pagador: Pagador;
};

/** Ocorrência 02 — pedido de baixa (obrigatórios da nota 6 (A)). */
export type PedidoBaixa = { ocorrencia: "02"; nossoNumero: string; valorCentavos: number };

/** Ocorrência 06 — alteração de vencimento (nota 6 (A)). */
export type AlteracaoVencimento = { ocorrencia: "06"; nossoNumero: string; valorCentavos: number; vencimento: Date };

export type ItemRemessaCobranca = EntradaTitulo | PedidoBaixa | AlteracaoVencimento;

// ───────────── formatação ─────────────

const TAM = 400;
const DIA_MS = 24 * 60 * 60 * 1000;

// item 2.2: maiúsculas, sem acento e sem caractere especial; "&" vira "E" (o manual desaconselha especiais)
const limpar = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/&/g, " E ").replace(/[^A-Z0-9 .,/\-]/g, " ").replace(/\s+/g, " ").trim();

/** Alfanumérico estrito: estoura se não couber (identificadores, nome e endereço do pagador). */
function alfa(v: string | null | undefined, tam: number, rotulo: string) {
  const s = limpar(v);
  if (s.length > tam) throw new CobrancaError(`${rotulo} "${s}" passa de ${tam} caracteres. Abrevie no cadastro.`);
  return s.padEnd(tam, " ");
}

/** Alfanumérico truncado: só onde o manual/banco aceita corte (nome da empresa no header, bairro, cidade). */
const alfaCorta = (v: string | null | undefined, tam: number) => limpar(v).slice(0, tam).padEnd(tam, " ");

/** Numérico: só dígitos, zeros à esquerda. Estoura se não couber. */
export function num(v: string | number | null | undefined, tam: number, rotulo = "Valor") {
  if (typeof v === "number" && (!Number.isSafeInteger(v) || v < 0)) throw new CobrancaError(`${rotulo} inválido: ${v}.`);
  const s = typeof v === "number" ? String(v) : (v ?? "").replace(/\D/g, "");
  if (s.length > tam) throw new CobrancaError(`${rotulo} "${s}" não cabe em ${tam} dígitos.`);
  return s.padStart(tam, "0");
}

/** Data DDMMAA (datas gravadas como meia-noite UTC). */
function ddmmaa(d: Date) {
  const a = d.getUTCFullYear();
  if (a < 2000 || a > 2099) throw new CobrancaError(`Data fora do intervalo 2000-2099: ${d.toISOString().slice(0, 10)}.`);
  return `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(a % 100).padStart(2, "0")}`;
}
const ddmmaaaa = (d: Date) => ddmmaa(d).slice(0, 4) + String(d.getUTCFullYear());
const brancos = (n: number) => " ".repeat(n);
const zeros = (n: number) => "0".repeat(n);

/** Monta um registro de 400 posições a partir de [início, fim, conteúdo]; confere tamanhos, sobreposição e lacunas. */
function reg(campos: [number, number, string][]): string {
  const a: (string | null)[] = Array(TAM).fill(null);
  for (const [ini, fim, v] of campos) {
    if (v.length !== fim - ini + 1) throw new CobrancaError(`Campo ${ini}-${fim} com ${v.length} caracteres (esperado ${fim - ini + 1}).`);
    for (let i = 0; i < v.length; i++) {
      if (a[ini - 1 + i] !== null) throw new CobrancaError(`Campo ${ini}-${fim} sobrepõe outro campo.`);
      a[ini - 1 + i] = v[i];
    }
  }
  const faltando = a.findIndex((c) => c === null);
  if (faltando >= 0) throw new CobrancaError(`Posição ${faltando + 1} não preenchida.`);
  return a.join("");
}

function conferirConta(b: Pick<Beneficiario, "agencia" | "conta" | "dac" | "carteira">) {
  if (!/^\d{1,4}$/.test(b.agencia.trim()) || !/^\d{1,5}$/.test(b.conta.trim()) || !/^\d$/.test(b.dac.trim()))
    throw new CobrancaError("Agência (4 dígitos), conta (5 dígitos) e DAC (1 dígito) da conta de cobrança inválidos.");
  const ag = num(b.agencia, 4, "Agência");
  const cc = num(b.conta, 5, "Conta");
  const dac = num(b.dac, 1, "DAC da conta");
  if (!(b.carteira in CARTEIRAS_COBRANCA)) throw new CobrancaError(`Carteira ${b.carteira} não suportada (só 109).`);
  // DAC da agência/conta = módulo 10 de agência + conta (anexo 3; exemplo do anexo 2: 0057/12345-7)
  if (String(mod10(ag + cc)) !== dac) throw new CobrancaError(`DAC ${dac} não confere com a agência ${ag} e conta ${cc}. Confira o cadastro da conta.`);
  return { ag, cc, dac };
}

function nossoNumero8(nn: string) {
  if (!/^\d{1,8}$/.test(nn)) throw new CobrancaError(`Nosso número "${nn}" deve ter de 1 a 8 dígitos.`);
  if (/^0+$/.test(nn)) throw new CobrancaError("Nosso número não pode ser zero.");
  return nn.padStart(8, "0");
}

function valorTitulo(c: number) {
  if (!Number.isSafeInteger(c) || c <= 0) throw new CobrancaError(`Valor do título inválido: ${c} centavos (nota 8: não pode ser zero).`);
  return c;
}

// ───────────── nosso número, fator, código de barras ─────────────

/** DAC do nosso número (nota 23 / anexo 4): módulo 10 de agência(4) + conta(5, sem DAC) + carteira(3) + nosso número(8). */
export function dacNossoNumero(b: { agencia: string; conta: string; carteira: CarteiraCobranca }, nossoNumero: string): number {
  return mod10(num(b.agencia, 4, "Agência") + num(b.conta, 5, "Conta") + b.carteira + nossoNumero8(nossoNumero));
}

/** Nosso número no formato impresso no boleto: CCC/NNNNNNNN-D (nota 23). */
export function nossoNumeroComDac(b: { agencia: string; conta: string; carteira: CarteiraCobranca }, nossoNumero: string): string {
  return `${b.carteira}/${nossoNumero8(nossoNumero)}-${dacNossoNumero(b, nossoNumero)}`;
}

const BASE_FATOR = Date.UTC(1997, 9, 7); // data base 07/10/1997; fator 1000 = 03/07/2000 (anexo 6)

/**
 * Fator de vencimento: 1000 em 03/07/2000, +1 por dia, até 9999 = 21/02/2025 (anexo 6 do manual de 2017, que para aí).
 * O reinício em 1000 = 22/02/2025 (ciclo de 9000 dias) é regra da FEBRABAN posterior ao manual: não está nos PDFs do Itaú.
 */
export function fatorVencimento(vencimento: Date): number {
  const f = fatorDoVencimento(vencimento);
  if (f === null) throw new CobrancaError("Vencimento anterior a 03/07/2000 não tem fator de vencimento.");
  return f;
}

/**
 * Data de um fator, escolhendo o ciclo que cai na janela de até 3000 dias antes e 5500 depois da data de referência
 * (critério da FEBRABAN para o reinício de 2025; não consta do manual Itaú de 2017).
 */
export function dataDoFator(fator: number, referencia: Date): Date {
  if (!Number.isInteger(fator) || fator < 1000 || fator > 9999) throw new CobrancaError(`Fator de vencimento inválido: ${fator}.`);
  const ref = Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate());
  for (let ciclo = 0; ciclo < 12; ciclo++) {
    const d = BASE_FATOR + (fator + ciclo * 9000) * DIA_MS;
    if (d >= ref - 3000 * DIA_MS && d <= ref + 5500 * DIA_MS) return new Date(d);
  }
  throw new CobrancaError(`Fator ${fator} fora da janela de pagamento em relação a ${referencia.toISOString().slice(0, 10)}.`);
}

/**
 * Código de barras de 44 posições da carteira 109 (anexo A, item 7.3.2):
 * 341 | 9 | DV | fator | valor(10) | carteira(3) | nosso número(8) | DAC NN | agência(4) | conta(5) | DAC ag/conta | 000
 */
export function codigoBarras44(b: Pick<Beneficiario, "agencia" | "conta" | "dac" | "carteira">, t: { nossoNumero: string; vencimento: Date; valorCentavos: number }): string {
  const { ag, cc, dac } = conferirConta(b);
  const v = valorTitulo(t.valorCentavos);
  if (v > 99_999_999_99) throw new CobrancaError("Valor acima de R$ 99.999.999,99 não cabe no código de barras (anexo 6).");
  const nn = nossoNumero8(t.nossoNumero);
  const livre = b.carteira + nn + dacNossoNumero(b, nn) + ag + cc + dac + "000";
  const semDv = "341" + "9" + String(fatorVencimento(t.vencimento)) + num(v, 10) + livre;
  return semDv.slice(0, 4) + dvBarras(semDv) + semDv.slice(4);
}

/** Linha digitável (IPTE, anexo A item 7.4 e anexo 3), formatada com pontos e espaços. */
export function linhaDigitavel(codigoBarras: string): string {
  lerBoleto(codigoBarras); // confere tamanho e DV geral
  return linhaDigitavelBoleto(codigoBarras);
}

export type BoletoCobranca = {
  codigoBarras: string;
  carteira: string;
  nossoNumero: string;
  dacNossoNumero: string;
  agencia: string;
  conta: string;
  dac: string;
  fator: number;
  vencimento: Date;
  valorCentavos: number;
};

/**
 * Inverso: aceita linha digitável (47) ou código de barras (44), confere os DVs (via boleto.ts)
 * e os DACs internos do Itaú (nosso número e agência/conta), e decompõe os campos.
 * `referencia` = data usada para escolher o ciclo do fator (normalmente hoje).
 */
export function lerBoletoCobranca(entrada: string, referencia: Date): BoletoCobranca {
  const { codigoBarras: c } = lerBoleto(entrada);
  if (c.slice(0, 4) !== "3419") throw new CobrancaError("Não é um boleto Itaú em reais (deve começar com 3419).");
  const carteira = c.slice(19, 22);
  if (!(carteira in CARTEIRAS_COBRANCA)) throw new CobrancaError(`Carteira ${carteira} não suportada.`);
  if (c.slice(41, 44) !== "000") throw new CobrancaError("Posições 42-44 do código de barras devem ser zeros.");
  const b = { agencia: c.slice(31, 35), conta: c.slice(35, 40), dac: c[40], carteira: carteira as CarteiraCobranca };
  conferirConta(b);
  const nossoNumero = c.slice(22, 30);
  if (String(dacNossoNumero(b, nossoNumero)) !== c[30]) throw new CobrancaError("DAC do nosso número não confere.");
  const fator = Number(c.slice(5, 9));
  return { codigoBarras: c, carteira, nossoNumero, dacNossoNumero: c[30], agencia: b.agencia, conta: b.conta, dac: b.dac, fator, vencimento: dataDoFator(fator, referencia), valorCentavos: Number(c.slice(9, 19)) };
}

// ───────────── remessa ─────────────

function docTipo(doc: string, rotulo: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return { tipo: "01", doc: d };
  if (d.length === 14) return { tipo: "02", doc: d };
  throw new CobrancaError(`CPF/CNPJ ${rotulo} inválido: "${doc}".`);
}

function headerRemessa(b: Beneficiario, conta: { ag: string; cc: string; dac: string }, dataGeracao: Date) {
  return reg([
    [1, 1, "0"], [2, 2, "1"], [3, 9, "REMESSA"], [10, 11, "01"], [12, 26, "COBRANCA".padEnd(15)],
    [27, 30, conta.ag], [31, 32, "00"], [33, 37, conta.cc], [38, 38, conta.dac], [39, 46, brancos(8)],
    [47, 76, alfaCorta(b.nome, 30)], [77, 79, "341"], [80, 94, "BANCO ITAU SA".padEnd(15)], [95, 100, ddmmaa(dataGeracao)],
    [101, 394, brancos(294)], [395, 400, num(1, 6)],
  ]);
}

/** Campos comuns do registro 1 (até a posição 37) e do final (sequencial). */
function inicioDetalhe(b: Beneficiario, conta: { ag: string; cc: string; dac: string }, comEmpresa: boolean): [number, number, string][] {
  const emp = docTipo(b.cnpj, "do beneficiário");
  return [
    [1, 1, "1"], [2, 3, comEmpresa ? emp.tipo : "00"], [4, 17, comEmpresa ? num(emp.doc, 14) : zeros(14)],
    [18, 21, conta.ag], [22, 23, "00"], [24, 28, conta.cc], [29, 29, conta.dac], [30, 33, brancos(4)], [34, 37, zeros(4)],
  ];
}

function detalheEntrada(b: Beneficiario, conta: { ag: string; cc: string; dac: string }, t: EntradaTitulo, seq: number) {
  const p = t.pagador;
  const pag = docTipo(p.documento, `do pagador ${p.nome}`);
  if (/^0+$/.test(pag.doc)) throw new CobrancaError(`CPF/CNPJ do pagador ${p.nome} zerado.`);
  const uf = limpar(p.uf);
  if (!UFS.has(uf)) throw new CobrancaError(`UF "${p.uf}" do pagador ${p.nome} inválida.`);
  const cep = p.cep.replace(/\D/g, "");
  if (cep.length !== 8) throw new CobrancaError(`CEP "${p.cep}" do pagador ${p.nome} deve ter 8 dígitos.`);
  const especie = t.especie ?? "01";
  if (!ESPECIES[especie]) throw new CobrancaError(`Espécie "${especie}" inválida (nota 10).`);
  const instr = t.instrucoes ?? [];
  for (const i of instr) if (!/^\d{2}$/.test(i)) throw new CobrancaError(`Instrução "${i}" deve ter 2 dígitos (nota 11).`);
  if (t.vencimento.getTime() < t.emissao.getTime()) throw new CobrancaError(`Título ${t.seuNumero}: vencimento antes da emissão.`);
  const juros = t.jurosDiaCentavos ?? 0;
  const desc = t.desconto;
  if (desc && (desc.valorCentavos <= 0 || desc.valorCentavos * 10 > t.valorCentavos * 9)) throw new CobrancaError(`Título ${t.seuNumero}: desconto deve ser positivo e até 90% do valor (nota 13).`);
  if (!t.seuNumero.trim()) throw new CobrancaError("Nº do documento (seu número) obrigatório.");
  return reg([
    ...inicioDetalhe(b, conta, true),
    [38, 62, alfa(t.usoEmpresa, 25, "Uso da empresa")], [63, 70, nossoNumero8(t.nossoNumero)], [71, 83, zeros(13)],
    [84, 86, b.carteira], [87, 107, brancos(21)], [108, 108, CARTEIRAS_COBRANCA[b.carteira]], [109, 110, "01"],
    [111, 120, alfa(t.seuNumero, 10, "Nº do documento")], [121, 126, ddmmaa(t.vencimento)], [127, 139, num(valorTitulo(t.valorCentavos), 13)],
    [140, 142, "341"], [143, 147, zeros(5)], [148, 149, especie], [150, 150, t.aceite ?? "N"], [151, 156, ddmmaa(t.emissao)],
    [157, 158, instr[0] ?? brancos(2)], [159, 160, instr[1] ?? brancos(2)], [161, 173, num(juros, 13, "Juros por dia")],
    [174, 179, desc ? ddmmaa(desc.ate) : zeros(6)], [180, 192, num(desc?.valorCentavos ?? 0, 13, "Desconto")],
    [193, 205, zeros(13)], [206, 218, zeros(13)],
    [219, 220, pag.tipo], [221, 234, num(pag.doc, 14)],
    // nota 15: nome (235-264) e brancos (265-274) podem ser agrupados; o Itaú abrevia para 30 se precisar
    [235, 274, alfa(p.nome, 40, "Nome do pagador")], [275, 314, alfa(p.logradouro, 40, "Endereço do pagador")],
    [315, 326, alfaCorta(p.bairro, 12)], [327, 334, cep], [335, 349, alfaCorta(p.cidade, 15)], [350, 351, uf],
    [352, 381, brancos(30)], [382, 385, brancos(4)], [386, 391, zeros(6)],
    [392, 393, num(t.prazoDias ?? 0, 2, "Prazo em dias")], [394, 394, " "], [395, 400, num(seq, 6)],
  ]);
}

/** Registro tipo 2 — multa (opcional). Data padrão: dia seguinte ao vencimento (manual exige ≥ vencimento). */
function registroMulta(t: EntradaTitulo, seq: number) {
  const m = t.multa!;
  const data = m.data ?? new Date(t.vencimento.getTime() + DIA_MS);
  if (data.getTime() < t.vencimento.getTime()) throw new CobrancaError(`Título ${t.seuNumero}: data da multa antes do vencimento (nota 35).`);
  let cod: string, v: number;
  if ("percentualCentesimos" in m) {
    cod = "2";
    v = m.percentualCentesimos;
    if (!(v > 0 && v < 100_00)) throw new CobrancaError(`Título ${t.seuNumero}: multa percentual deve ser maior que 0 e menor que 100%.`);
  } else {
    cod = "1";
    v = m.valorCentavos;
    if (!(v > 0 && v < t.valorCentavos)) throw new CobrancaError(`Título ${t.seuNumero}: multa em valor deve ser positiva e menor que o título.`);
  }
  return reg([[1, 1, "2"], [2, 2, cod], [3, 10, ddmmaaaa(data)], [11, 23, num(v, 13, "Multa")], [24, 394, brancos(371)], [395, 400, num(seq, 6)]]);
}

/** Baixa (02) e alteração de vencimento (06): só os obrigatórios da nota 6 (A); o resto zeros/brancos. */
function detalheInstrucao(b: Beneficiario, conta: { ag: string; cc: string; dac: string }, t: PedidoBaixa | AlteracaoVencimento, seq: number) {
  return reg([
    ...inicioDetalhe(b, conta, false),
    [38, 62, brancos(25)], [63, 70, nossoNumero8(t.nossoNumero)], [71, 83, zeros(13)], [84, 86, b.carteira], [87, 107, brancos(21)],
    [108, 108, CARTEIRAS_COBRANCA[b.carteira]], [109, 110, t.ocorrencia], [111, 120, brancos(10)],
    [121, 126, t.ocorrencia === "06" ? ddmmaa(t.vencimento) : zeros(6)], [127, 139, num(valorTitulo(t.valorCentavos), 13)],
    [140, 142, "341"], [143, 147, zeros(5)], [148, 149, brancos(2)], [150, 150, " "], [151, 156, zeros(6)], [157, 160, brancos(4)],
    [161, 218, zeros(58)], [219, 234, zeros(16)], [235, 326, brancos(92)], [327, 334, zeros(8)], [335, 385, brancos(51)],
    [386, 393, zeros(8)], [394, 394, " "], [395, 400, num(seq, 6)],
  ]);
}

/**
 * Gera o arquivo remessa CNAB 400 (linhas de 400 posições + CRLF).
 * `dataGeracao` é um instante; a data do header é o dia em Brasília.
 * Obs.: o header de remessa não tem campo de número sequencial do arquivo (101-394 são brancos).
 */
export function gerarRemessaCobranca(beneficiario: Beneficiario, itens: ItemRemessaCobranca[], dataGeracao: Date): string {
  if (itens.length === 0) throw new CobrancaError("Nenhum título na remessa.");
  const conta = conferirConta(beneficiario);
  docTipo(beneficiario.cnpj, "do beneficiário");
  const vistos = new Set<string>();
  for (const t of itens) {
    const nn = nossoNumero8(t.nossoNumero);
    if (vistos.has(nn)) throw new CobrancaError(`Nosso número ${nn} repetido no mesmo arquivo (tabela 1, código 15).`);
    vistos.add(nn);
  }
  const linhas = [headerRemessa(beneficiario, conta, diaBrasilia(dataGeracao))];
  for (const t of itens) {
    if (t.ocorrencia === "01") {
      linhas.push(detalheEntrada(beneficiario, conta, t, linhas.length + 1));
      if (t.multa) linhas.push(registroMulta(t, linhas.length + 1));
    } else if (t.ocorrencia === "02" || t.ocorrencia === "06") {
      linhas.push(detalheInstrucao(beneficiario, conta, t, linhas.length + 1));
    } else {
      throw new CobrancaError(`Ocorrência de remessa não suportada.`);
    }
  }
  linhas.push(reg([[1, 1, "9"], [2, 394, brancos(393)], [395, 400, num(linhas.length + 1, 6)]]));
  return linhas.join("\r\n") + "\r\n";
}

// ───────────── retorno ─────────────

export type CategoriaOcorrencia =
  | "ENTRADA_CONFIRMADA" | "ENTRADA_REJEITADA" | "LIQUIDACAO" | "BAIXA" | "ALTERACAO" | "REJEICAO_INSTRUCAO" | "TARIFA" | "CHEQUE_DEVOLVIDO" | "OUTRA";

/** Baixas que, pela descrição da nota 17, indicam dinheiro recebido fora da liquidação 06/07/08 (10, 59). */
export const BAIXAS_COM_PAGAMENTO = ["10", "59"];

const CATEGORIAS: [CategoriaOcorrencia, string[]][] = [
  ["ENTRADA_CONFIRMADA", ["02", "64", "71", "73"]],
  ["ENTRADA_REJEITADA", ["03", "60"]],
  ["LIQUIDACAO", ["06", "07", "08"]],
  ["BAIXA", ["05", "09", "10", "32", "47", "59"]],
  ["ALTERACAO", ["04", "12", "13", "14"]],
  ["REJEICAO_INSTRUCAO", ["15", "16", "17", "18", "24", "74"]],
  ["CHEQUE_DEVOLVIDO", ["69"]], // cheque usado no pagamento voltou: a liquidação já baixada deixa de valer
  ["TARIFA", ["23", "26", "27", "28", "29", "30", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "48", "51", "52", "53", "54", "55", "56", "61", "62", "80", "82", "83", "85", "86", "87", "88", "89", "90", "91", "92", "93"]],
];

export function categoriaOcorrencia(codigo: string): CategoriaOcorrencia {
  return CATEGORIAS.find(([, cods]) => cods.includes(codigo))?.[0] ?? "OUTRA";
}

export type Codigo = { codigo: string; descricao: string };

export type EventoCobranca = {
  linha: number;
  carteira: string;
  nossoNumero: string;
  dacNossoNumero: string;
  seuNumero: string; // nº do documento (117-126)
  usoEmpresa: string; // 38-62
  ocorrencia: Codigo & { categoria: CategoriaOcorrencia };
  dataOcorrencia: Date | null;
  vencimento: Date | null;
  dataCredito: Date | null;
  /** Todos em centavos. `pago` = "valor principal — valor lançado em conta corrente" (254-266). */
  centavos: { titulo: number; pago: number; jurosMulta: number; desconto: number; abatimento: number; tarifa: number; iof: number; outrosCreditos: number };
  motivosRejeicao: Codigo[]; // 378-385, ocorrências 03/15/16/17/18/60
  mensagens: Codigo[]; // 378-385 na entrada confirmada (02, tabela 10)
  complemento: Codigo | null; // 302-305 nas ocorrências 24, 25, 57, 74, 79
  codigoLiquidacao: Codigo | null; // 393-394 (nota 28)
  agenciaCobradora: string;
  nomePagador: string;
};

export type RetornoCobranca = {
  agencia: string;
  conta: string;
  dac: string;
  dataGeracao: Date | null;
  sequencialArquivo: number;
  dataCredito: Date | null;
  eventos: EventoCobranca[];
  trailer: { quantidade: number; valorCentavos: number };
};

const campo = (l: string, ini: number, fim: number) => l.slice(ini - 1, fim);
const cent = (s: string) => (/^\d+$/.test(s) ? Number(s) : 0);

function dataRet(s: string): Date | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m || s === "000000") return null;
  const d = new Date(Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

function descrever(tab: Record<string, string> | undefined, cod: string, ref: string): Codigo {
  return { codigo: cod, descricao: tab?.[cod] ?? `Código ${cod} (ver ${ref} do manual de cobrança)` };
}

/** Lê o arquivo retorno CNAB 400 de cobrança (registros 0, 1, 4 e 9). Recusa arquivo de remessa. */
export function lerRetornoCobranca(texto: string): RetornoCobranca {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  while (linhas.length && linhas.at(-1) === "") linhas.pop();
  if (linhas.length < 2) throw new CobrancaError("Arquivo vazio ou incompleto.");
  for (const [i, l] of linhas.entries()) {
    if (l.length !== TAM) throw new CobrancaError(`Linha ${i + 1} com ${l.length} caracteres (o CNAB 400 exige 400).`);
    if (Number(campo(l, 395, 400)) !== i + 1) throw new CobrancaError(`Linha ${i + 1}: número sequencial ${campo(l, 395, 400)} fora de ordem.`);
  }
  const h = linhas[0];
  if (h[0] !== "0") throw new CobrancaError("Primeira linha não é um header (tipo 0).");
  if (campo(h, 2, 9) === "1REMESSA") throw new CobrancaError("Este arquivo é uma remessa, não um retorno do banco.");
  if (campo(h, 2, 9) !== "2RETORNO" || campo(h, 10, 11) !== "01" || campo(h, 77, 79) !== "341") throw new CobrancaError("Não é um retorno de cobrança do Itaú (header inválido).");
  const t = linhas.at(-1)!;
  if (campo(t, 1, 7) !== "9201341") throw new CobrancaError("Última linha não é o trailer de retorno de cobrança do Itaú.");

  const eventos: EventoCobranca[] = [];
  let qtd1 = 0, qtd4 = 0, soma = 0;
  for (let i = 1; i < linhas.length - 1; i++) {
    const l = linhas[i];
    const tipo = l[0];
    if (tipo === "4") { qtd4++; continue; } // rateio de crédito: não usado
    if (tipo === "0" || tipo === "9") throw new CobrancaError(`Linha ${i + 1}: mais de um header/trailer no arquivo (indicador 04.2 "por conta" não suportado).`);
    if (tipo !== "1") throw new CobrancaError(`Linha ${i + 1}: tipo de registro "${tipo}" desconhecido.`);
    qtd1++;
    const cod = campo(l, 109, 110);
    const tab = MOTIVOS_POR_OCORRENCIA[cod];
    const motivos = (campo(l, 378, 385).match(/.{2}/g) ?? []).map((c) => c.trim()).filter((c) => c && c !== "00").map((c) => descrever(tab?.codigos, c, `nota 20 tabela ${tab?.tabela ?? "?"}`));
    const compl = campo(l, 302, 305).trim();
    const tabCompl: Record<string, [Record<string, string> | undefined, string]> = { "57": [INSTRUCOES_CANCELADAS, "nota 20 tabela 8"], "25": [undefined, "nota 20 tabela 6"], "24": [undefined, "nota 20 tabela 7"], "74": [undefined, "nota 20 tabela 11"], "79": [undefined, "nota 20 tabela 12"] };
    const liq = campo(l, 393, 394).trim();
    const titulo = cent(campo(l, 153, 165));
    soma += titulo;
    eventos.push({
      linha: i + 1,
      carteira: campo(l, 83, 85),
      nossoNumero: campo(l, 86, 93),
      dacNossoNumero: campo(l, 94, 94),
      seuNumero: campo(l, 117, 126).trim(),
      usoEmpresa: campo(l, 38, 62).trim(),
      ocorrencia: { ...descrever(OCORRENCIAS_RETORNO, cod, "nota 17"), categoria: categoriaOcorrencia(cod) },
      dataOcorrencia: dataRet(campo(l, 111, 116)),
      vencimento: dataRet(campo(l, 147, 152)),
      dataCredito: dataRet(campo(l, 296, 301)),
      centavos: {
        titulo, pago: cent(campo(l, 254, 266)), jurosMulta: cent(campo(l, 267, 279)), desconto: cent(campo(l, 241, 253)),
        abatimento: cent(campo(l, 228, 240)), tarifa: cent(campo(l, 176, 188)), iof: cent(campo(l, 215, 227)), outrosCreditos: cent(campo(l, 280, 292)),
      },
      motivosRejeicao: cod === "02" ? [] : tab ? motivos : [],
      mensagens: cod === "02" ? motivos : [],
      complemento: tabCompl[cod] && compl && !/^0+$/.test(compl) ? descrever(tabCompl[cod][0], compl, tabCompl[cod][1]) : null,
      codigoLiquidacao: liq ? descrever(CODIGOS_LIQUIDACAO, liq, "nota 28") : null,
      agenciaCobradora: campo(l, 169, 172),
      nomePagador: campo(l, 325, 354).trim(),
    });
  }

  const trailer = { quantidade: Number(campo(t, 213, 220)), valorCentavos: Number(campo(t, 221, 234)) };
  // "quantidade de registros de transação": aceita contar só os tipo 1 ou tipo 1 + tipo 4 (o manual não diz)
  if (trailer.quantidade !== qtd1 && trailer.quantidade !== qtd1 + qtd4) throw new CobrancaError(`Trailer informa ${trailer.quantidade} registros, mas o arquivo tem ${qtd1}. Arquivo incompleto?`);
  if (trailer.valorCentavos !== soma) throw new CobrancaError(`Trailer informa total ${trailer.valorCentavos} centavos, mas a soma dos títulos é ${soma}.`);

  return {
    agencia: campo(h, 27, 30), conta: campo(h, 33, 37), dac: campo(h, 38, 38),
    dataGeracao: dataRet(campo(h, 95, 100)), sequencialArquivo: cent(campo(h, 109, 113)), dataCredito: dataRet(campo(h, 114, 119)),
    eventos, trailer,
  };
}
