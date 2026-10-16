/**
 * Código de barras de boleto bancário (padrão FEBRABAN, 44 dígitos) e sua linha digitável (47 dígitos).
 * Regras de DV conforme Anexo A do manual SISPAG Itaú (v085): campos da linha por módulo 10,
 * DV geral do código de barras por módulo 11. Função pura.
 */

import { ErroNegocio } from "@/lib/erros";
import { money } from "@/lib/format";

export class BoletoError extends ErroNegocio {}

/** Módulo 10 (pesos 2,1,2,1... da direita para a esquerda, somando os algarismos dos produtos). */
export function mod10(num: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    const p = Number(num[i]) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  const dv = 10 - (soma % 10);
  return dv === 10 ? 0 : dv;
}

/** DV geral do código de barras: módulo 11 sobre os 43 dígitos (sem a 5ª posição), pesos 2..9. */
export function dvBarras(semDv43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = semDv43.length - 1; i >= 0; i--) {
    soma += Number(semDv43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 1 || dv === 10 || dv === 11 ? 1 : dv;
}

function conferirBarras(b: string) {
  if (!/^\d{44}$/.test(b)) throw new BoletoError("O código de barras deve ter 44 dígitos.");
  if (b[0] === "8") throw new BoletoError("Este é um código de conta de consumo ou tributo (começa com 8). Só boletos bancários são aceitos.");
  // Anexo A, item 1: posição 4 = código da moeda; 9 = Real (o SISPAG paga em REA)
  if (b[3] !== "9") throw new BoletoError("Boleto em moeda diferente de Real (código da moeda não é 9). Não é aceito.");
  const esperado = dvBarras(b.slice(0, 4) + b.slice(5));
  if (Number(b[4]) !== esperado) throw new BoletoError("Código de barras inválido (dígito verificador não confere).");
}

export type Boleto = { codigoBarras: string; banco: string; valor: number; fator: number };

/**
 * Aceita a linha digitável (47 dígitos, com ou sem pontuação) ou o código de barras (44 dígitos)
 * e devolve o código de barras validado.
 */
export function lerBoleto(entrada: string): Boleto {
  const d = entrada.replace(/\D/g, "");
  let barras: string;
  if (d.length === 47) {
    const c1 = d.slice(0, 10);
    const c2 = d.slice(10, 21);
    const c3 = d.slice(21, 32);
    for (const [n, c] of [
      [1, c1],
      [2, c2],
      [3, c3],
    ] as const) {
      if (mod10(c.slice(0, -1)) !== Number(c.slice(-1))) throw new BoletoError(`Linha digitável inválida: dígito do campo ${n} não confere. Confira a digitação.`);
    }
    barras = d.slice(0, 4) + d[32] + d.slice(33, 47) + c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
  } else if (d.length === 44) {
    barras = d;
  } else if (d.length === 48) {
    throw new BoletoError("Este é um código de conta de consumo ou tributo (48 dígitos). Só boletos bancários são aceitos.");
  } else {
    throw new BoletoError("Informe a linha digitável (47 dígitos) ou o código de barras (44 dígitos).");
  }
  conferirBarras(barras);
  // Anexo A, obs. (b): fator abaixo de 1000 não é vencimento; as posições 6-19 inteiras formam o valor do título
  const fator = Number(barras.slice(5, 9));
  if (fator < 1000) return { codigoBarras: barras, banco: barras.slice(0, 3), valor: Number(barras.slice(5, 19)) / 100, fator: 0 };
  return { codigoBarras: barras, banco: barras.slice(0, 3), valor: Number(barras.slice(9, 19)) / 100, fator };
}

const DIA_MS = 86_400_000;
const BASE_FATOR = Date.UTC(1997, 9, 7); // fator 1000 = 03/07/2000

/**
 * Fator de vencimento FEBRABAN: 1000 em 03/07/2000, +1 por dia; depois de 9999 (21/02/2025) volta a 1000 (22/02/2025).
 * Ciclo de 9000 dias. Devolve null para data anterior a 03/07/2000.
 */
export function fatorDoVencimento(vencimento: Date): number | null {
  const dias = Math.round((Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate()) - BASE_FATOR) / DIA_MS);
  if (dias < 1000) return null;
  return ((dias - 1000) % 9000) + 1000;
}

const dataBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/**
 * Confere o boleto do fornecedor com o título: o valor impresso no código de barras (posições 10-19) tem de ser o valor
 * do título e o fator (posições 6-9) tem de ser o vencimento. Boleto sem valor (zeros) ou sem fator ("0000") não é
 * conferido nesse campo. Devolve a mensagem do problema ou null.
 */
export function divergenciaBoleto(codigoBarras: string, titulo: { valor: number; vencimento: Date }): string | null {
  const b = lerBoleto(codigoBarras);
  if (b.valor > 0 && Math.round(b.valor * 100) !== Math.round(titulo.valor * 100)) {
    return `O boleto é de ${money(b.valor)}, mas o título está com ${money(titulo.valor)}. Corrija o valor do título (ou o código de barras) para que fiquem iguais.`;
  }
  if (b.valor > 0 && b.fator >= 1000 && fatorDoVencimento(titulo.vencimento) !== b.fator) {
    const venc = new Date(BASE_FATOR + b.fator * DIA_MS);
    const ciclos = [0, 1, 2].map((c) => new Date(venc.getTime() + c * 9000 * DIA_MS));
    const provavel = ciclos.reduce((a, c) => (Math.abs(c.getTime() - titulo.vencimento.getTime()) < Math.abs(a.getTime() - titulo.vencimento.getTime()) ? c : a));
    return `O boleto vence em ${dataBr(provavel)}, mas o título está com vencimento ${dataBr(titulo.vencimento)}. Corrija o vencimento (ou o código de barras) para que fiquem iguais.`;
  }
  return null;
}

/** Código de barras (44) → linha digitável formatada, para exibição. */
export function linhaDigitavel(barras: string): string {
  const livre = barras.slice(19);
  const c1 = barras.slice(0, 4) + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  const f = (c: string, corte: number) => `${c.slice(0, corte)}.${c.slice(corte)}`;
  return `${f(c1 + mod10(c1), 5)} ${f(c2 + mod10(c2), 5)} ${f(c3 + mod10(c3), 5)} ${barras[4]} ${barras.slice(5, 19)}`;
}
