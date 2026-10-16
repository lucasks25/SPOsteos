/**
 * Regras auxiliares do validador CNAB 240 (cnab-validador.ts), escritas a partir do manual
 * "SISPAG — Layout de Arquivos — CNAB Versão 085" (out/2020), SEM reaproveitar o código gerador
 * (sispag.ts / boleto.ts / documentos-br.ts): a ideia é um segundo par de olhos independente.
 * Funções puras.
 */

/** DV de CPF (11 dígitos) — algoritmo da Receita Federal (módulo 11, pesos 10..2 e 11..2). */
export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** DV de CNPJ (14 dígitos) — módulo 11 com pesos 2..9 da direita para a esquerda. */
export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    let p = 2;
    for (let i = n - 1; i >= 0; i--) {
      s += Number(d[i]) * p;
      p = p === 9 ? 2 : p + 1;
    }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/**
 * Confere tipo de inscrição (1 = CPF, 2 = CNPJ) contra o número (alinhado à direita com zeros).
 * Devolve null se ok, ou a descrição do problema.
 */
export function conferirInscricao(tipo: string, numero: string): string | null {
  if (!/^\d+$/.test(numero)) return "número não numérico";
  if (tipo === "1") {
    const cpf = numero.slice(-11);
    if (!/^0*$/.test(numero.slice(0, -11))) return "tipo 1 (CPF) com mais de 11 dígitos significativos";
    return cpfValido(cpf) ? null : `CPF ${cpf} com dígito verificador inválido`;
  }
  if (tipo === "2") {
    const cnpj = numero.slice(-14);
    if (!/^0*$/.test(numero.slice(0, -14))) return "tipo 2 (CNPJ) com mais de 14 dígitos significativos";
    return cnpjValido(cnpj) ? null : `CNPJ ${cnpj} com dígito verificador inválido`;
  }
  return `tipo de inscrição "${tipo}" fora do domínio (1 = CPF, 2 = CNPJ)`;
}

/** DDMMAAAA de calendário real. */
export function dataValida(s: string): boolean {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < 1900 || mes < 1 || mes > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(a, mes - 1, d));
  return dt.getUTCDate() === d && dt.getUTCMonth() === mes - 1;
}

export const dataParaUTC = (s: string) => Date.UTC(Number(s.slice(4, 8)), Number(s.slice(2, 4)) - 1, Number(s.slice(0, 2)));

/** HHMMSS válido. */
export function horaValida(s: string): boolean {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3]) < 60;
}

/**
 * DV geral do código de barras de boleto (Anexo A, item 3): módulo 11 sobre os 43 dígitos sem a
 * 5ª posição, pesos 2..9 da direita para a esquerda; DV = 11 − resto; 0, 1, 10 ou 11 → 1.
 */
export function dvCodigoBarras(barras44: string): number {
  const sem = barras44.slice(0, 4) + barras44.slice(5);
  let s = 0;
  let p = 2;
  for (let i = sem.length - 1; i >= 0; i--) {
    s += Number(sem[i]) * p;
    p = p === 9 ? 2 : p + 1;
  }
  const dv = 11 - (s % 11);
  return dv === 0 || dv === 1 || dv === 10 || dv === 11 ? 1 : dv;
}

const DIA = 86_400_000;
const BASE_FATOR = Date.UTC(1997, 9, 7); // 07/10/1997 = fator 0 (FEBRABAN)
const REINICIO_FATOR = Date.UTC(2025, 1, 22); // 22/02/2025 = fator 1000 após o 9999 (FEBRABAN, fora do manual v085)

/** Datas possíveis para um fator de vencimento (o fator reinicia em 1000 após 21/02/2025). */
export function datasDoFator(fator: number): number[] {
  if (fator < 1000) return [];
  return [BASE_FATOR + fator * DIA, REINICIO_FATOR + (fator - 1000) * DIA];
}

/**
 * Formato da chave Pix pelo tipo (nota 40 do manual): 01 telefone "+" + país + DDD + celular de 9 dígitos;
 * 02 e-mail com "@" e até 77 caracteres; 03 CPF (11) ou CNPJ (14) só dígitos; 04 aleatória, 36 posições com traços.
 */
export function conferirChavePix(tipo: string, chave: string): string | null {
  if (!chave) return "chave Pix vazia";
  switch (tipo) {
    case "01":
      return /^\+55\d{2}9\d{8}$/.test(chave) ? null : "telefone deve ser +55, DDD e celular de 9 dígitos (ex.: +5511987654321)";
    case "02":
      if (chave.length > 77) return "e-mail com mais de 77 caracteres";
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(chave) ? null : "e-mail sem formato usuario@dominio";
    case "03":
      if (/^\d{11}$/.test(chave)) return cpfValido(chave) ? null : "CPF da chave com DV inválido";
      if (/^\d{14}$/.test(chave)) return cnpjValido(chave) ? null : "CNPJ da chave com DV inválido";
      return "CPF/CNPJ deve ter 11 ou 14 dígitos, sem pontos ou traços";
    case "04":
      return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(chave) ? null : "chave aleatória deve ter 36 posições (8-4-4-4-12, hexadecimal com traços)";
    default:
      return `tipo de chave "${tipo}" fora do domínio da nota 37`;
  }
}

/** Ocorrências do arquivo retorno (nota 8 do manual v085). */
export const OCORRENCIAS_NOTA8 = new Set(
  ("00 AE AG AH AI AJ AL AM AN AO AP AQ AR BC BD BE BI BL CD CE CF CG CH CI CJ CK CL CM CN CO CP CQ CR CS " +
    "DA DB DC DD DE DF DG DH DI DJ DK DL DM DV D0 D1 D2 D3 D4 D5 D6 D7 D8 D9 EM EX E0 E1 E2 E3 E4 FC FD HA HM " +
    "IB IC ID IE IF IG IH II IJ IK IL IM IN IO IP IQ IR IS IT IU IV IX LA LC NA NB NC ND NE NF NG NH NI NR PD RJ RS SS TA TI X1 X2 X3 X4").split(" "),
);

/** Tipos de pagamento (nota 4). */
export const TIPOS_PAGAMENTO = ["10", "15", "20", "22", "30", "40", "50", "60", "80", "90", "98"] as const;

/** Formas de pagamento (nota 5). */
export const FORMAS_PAGAMENTO = [
  "01", "02", "03", "05", "06", "07", "10", "13", "16", "17", "18", "19", "22", "25", "27", "30", "31", "32", "35", "41", "43", "45", "47", "60", "91",
] as const;

/** Formas de lote com segmento A (header de lote layout 040) e com segmento J (layout 030). */
export const FORMAS_SEGMENTO_A = new Set(["01", "02", "03", "05", "06", "07", "10", "32", "41", "43", "45", "60"]);
export const FORMAS_SEGMENTO_J = new Set(["30", "31", "47"]);
/** Formas Pix: vão em arquivo separado (item 2.2). */
export const FORMAS_PIX = new Set(["45", "47"]);

/** Tipos de movimento (nota 10). Os de inclusão entram nos totais (nota 17 b). */
export const MOVIMENTOS = ["000", "001", "002", "003", "004", "512", "517", "519", "998", "999"] as const;
export const MOVIMENTOS_INCLUSAO = new Set(["000", "001", "002", "003"]);

/** Finalidades de TED (nota 26). Conteúdo inválido não rejeita: o banco assume 00010. */
export const FINALIDADES_TED = [
  "00001", "00002", "00003", "00004", "00005", "00006", "00007", "00008", "00009", "00010", "00011", "00015", "00016", "00043", "00044",
  "00100", "00101", "00200", "00201", "00204", "00205", "00300", "00500", "00501", "00502", "00503", "00504", "00505", "00506", "00507",
  "00508", "00509", "00510", "00511", "00512", "00513", "00514", "00515", "00516", "00517", "00518", "00519", "00520",
] as const;
