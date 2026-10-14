/**
 * Leitor do extrato de conta corrente CNAB 240 do Itaú (retorno de conciliação bancária).
 * Referência: manual Itaú "Extrato de Conta Corrente — CNAB240 — Versão 5.0" (fev/2011).
 * Função pura, sem acesso a banco. Valores: crédito > 0, débito < 0.
 *
 * Estrutura: header de arquivo (0) → lotes, um por conta [header de lote (1) com saldo inicial,
 * detalhes (3, segmento E), trailer de lote (5) com saldo final e totais] → trailer de arquivo (9).
 */

import { ErroNegocio } from "@/lib/erros";

export type LinhaCnab = { fitid: string; data: Date; valor: number; descricao: string };

export type LoteCnab = {
  agencia: string; // 4 dígitos
  conta: string; // 5 dígitos
  dac: string;
  saldoInicial: { data: Date | null; valor: number };
  saldoFinal: { data: Date | null; valor: number } | null;
  linhas: LinhaCnab[];
  futuros: number; // lançamentos tipo 5 (informativos, não importados)
};

export class CnabError extends ErroNegocio {}

const TAM = 240;

/** Campo pelas posições do manual (1-based, inclusivas). */
const campo = (l: string, ini: number, fim: number) => l.slice(ini - 1, fim);

/** DDMMAAAA → Date UTC; zeros/inválida → null. */
export function dataCnab(s: string): Date | null {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m || s === "00000000") return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

/** 9(16)V9(02) → número com 2 casas. */
function valorCnab(s: string, onde: string): number {
  if (!/^\d+$/.test(s)) throw new CnabError(`Valor inválido em ${onde}: "${s.trim()}".`);
  return Number(s) / 100;
}

/** Aplica o sinal pela situação D/C. */
function comSinal(v: number, dc: string, onde: string) {
  if (dc === "C") return v;
  if (dc === "D") return -v;
  throw new CnabError(`Indicador D/C inválido em ${onde}: "${dc}".`);
}

const cent = (n: number) => Math.round(n * 100);

/** Indica se o texto parece um arquivo CNAB 240 (e não OFX). */
export function pareceCnab240(texto: string): boolean {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  // banco (3) + lote "0000" + tipo de registro "0" (header de arquivo)
  return /^\d{3}00000/.test(primeira) && primeira.length <= TAM;
}

export function lerCnab240Extrato(texto: string): LoteCnab[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) throw new CnabError("Arquivo vazio ou incompleto.");

  const lotes: LoteCnab[] = [];
  let atual: (LoteCnab & { soma1: { d: number; c: number }; soma2: { d: number; c: number }; usados: Map<string, number> }) | null = null;
  let viuHeader = false;
  let viuTrailer = false;

  linhas.forEach((bruta, i) => {
    const n = i + 1;
    if (bruta.length > TAM) throw new CnabError(`Linha ${n} tem ${bruta.length} caracteres; o CNAB 240 tem 240.`);
    const l = bruta.padEnd(TAM, " "); // alguns sistemas cortam os brancos finais
    if (campo(l, 1, 3) !== "341") throw new CnabError(`Linha ${n}: banco ${campo(l, 1, 3)} — este leitor é do layout do Itaú (341).`);
    const tipo = campo(l, 8, 8);

    if (tipo === "0") {
      if (campo(l, 143, 143) !== "2") throw new CnabError("O arquivo não é de retorno (código diferente de 2 no header).");
      viuHeader = true;
      return;
    }
    if (!viuHeader) throw new CnabError("Header de arquivo ausente.");

    if (tipo === "1") {
      if (atual) throw new CnabError(`Linha ${n}: novo lote sem o trailer do lote anterior.`);
      if (campo(l, 9, 9) !== "E" || campo(l, 10, 11) !== "04") throw new CnabError(`Linha ${n}: o lote não é de extrato de conta corrente (operação E, serviço 04).`);
      const where = `saldo inicial (linha ${n})`;
      atual = {
        agencia: campo(l, 54, 57),
        conta: campo(l, 66, 70),
        dac: campo(l, 72, 72).trim(),
        saldoInicial: { data: dataCnab(campo(l, 143, 150)), valor: comSinal(valorCnab(campo(l, 151, 168), where), campo(l, 169, 169), where) },
        saldoFinal: null,
        linhas: [],
        futuros: 0,
        soma1: { d: 0, c: 0 },
        soma2: { d: 0, c: 0 },
        usados: new Map(),
      };
      return;
    }

    if (tipo === "3") {
      if (!atual) throw new CnabError(`Linha ${n}: lançamento fora de um lote.`);
      if (campo(l, 14, 14) !== "E") return; // só o segmento E traz lançamentos
      const where = `lançamento (linha ${n})`;
      const tipoLanc = campo(l, 15, 15);
      const bruto = valorCnab(campo(l, 151, 168), where);
      const dc = campo(l, 169, 169);
      const valor = comSinal(bruto, dc, where);
      if (tipoLanc === "5") {
        atual.futuros++;
        return; // lançamento futuro: informativo, não compõe o saldo
      }
      const soma = tipoLanc === "2" ? atual.soma2 : atual.soma1;
      if (dc === "D") soma.d += cent(bruto);
      else soma.c += cent(bruto);

      const data = dataCnab(campo(l, 143, 150)) ?? dataCnab(campo(l, 135, 142));
      if (!data) throw new CnabError(`Data inválida no ${where}.`);
      const historico = campo(l, 177, 201).trim();
      const documento = campo(l, 235, 240).trim();
      const codigo = campo(l, 173, 176).trim();
      const descricao = [historico || "LANCAMENTO", documento && `DOC ${documento}`].filter(Boolean).join(" ").slice(0, 200);
      // Identificador estável entre arquivos (diário e mensal trazem o mesmo lançamento com sequências diferentes)
      const base = ["CNAB", atual.agencia, atual.conta, campo(l, 143, 150), dc, campo(l, 151, 168), codigo, historico, documento].join("|");
      const k = atual.usados.get(base) ?? 0;
      atual.usados.set(base, k + 1);
      atual.linhas.push({ fitid: k === 0 ? base : `${base}#${k}`, data, valor, descricao });
      return;
    }

    if (tipo === "5") {
      if (!atual) throw new CnabError(`Linha ${n}: trailer de lote sem header.`);
      const where = `trailer do lote (linha ${n})`;
      const totD = cent(valorCnab(campo(l, 177, 194), where));
      const totC = cent(valorCnab(campo(l, 195, 212), where));
      const s1 = atual.soma1;
      const s12 = { d: atual.soma1.d + atual.soma2.d, c: atual.soma1.c + atual.soma2.c };
      const confere = (s: { d: number; c: number }) => s.d === totD && s.c === totC;
      if (!confere(s1) && !confere(s12)) {
        throw new CnabError(
          `Totais do lote da conta ${atual.agencia}/${atual.conta} não conferem com os lançamentos (banco: D ${totD / 100} C ${totC / 100}). O arquivo pode estar corrompido ou em outra versão de layout.`,
        );
      }
      atual.saldoFinal = { data: dataCnab(campo(l, 143, 150)), valor: comSinal(valorCnab(campo(l, 151, 168), where), campo(l, 169, 169), where) };
      const { agencia, conta, dac, saldoInicial, saldoFinal, linhas: ls, futuros } = atual;
      lotes.push({ agencia, conta, dac, saldoInicial, saldoFinal, linhas: ls, futuros });
      atual = null;
      return;
    }

    if (tipo === "9") {
      viuTrailer = true;
      return;
    }
    throw new CnabError(`Linha ${n}: tipo de registro desconhecido "${tipo}".`);
  });

  if (atual) throw new CnabError("Lote sem trailer: o arquivo está incompleto.");
  if (!viuTrailer) throw new CnabError("Trailer de arquivo ausente: o arquivo está incompleto.");
  return lotes;
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Confere se o lote é da conta cadastrada (agência e número, com ou sem o dígito). */
export function loteDaConta(lote: LoteCnab, conta: { agencia: string | null; numero: string | null }): boolean | null {
  const ag = digitos(conta.agencia);
  const num = digitos(conta.numero);
  if (!ag || !num) return null; // conta sem agência/número cadastrados: não dá para conferir
  const cc = digitos(lote.conta);
  return ag === digitos(lote.agencia) && (num === cc || num === digitos(lote.conta + lote.dac));
}
