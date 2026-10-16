/** Validação e formatação de documentos brasileiros (CNPJ / CPF) e chave Pix. Sem dependências de servidor. */

import { ErroNegocio } from "@/lib/erros";

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

function allSame(d: string) {
  return /^(\d)\1*$/.test(d);
}

export function isCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allSame(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allSame(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function formatCnpj(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCpf(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata CPF ou CNPJ conforme o número de dígitos. */
export function formatCpfCnpj(value: string) {
  const d = onlyDigits(value);
  return d.length === 11 ? formatCpf(d) : d.length === 14 ? formatCnpj(d) : value;
}

export function isCpfOrCnpj(value: string) {
  const d = onlyDigits(value);
  return d.length === 11 ? isCpf(d) : isCnpj(d);
}

/**
 * Valida um CNPJ informado em formulário. Retorna o CNPJ formatado ou uma mensagem de erro.
 * `atual` = valor já gravado: se não mudou, não revalida (permite editar registros legados).
 */
export function checarCnpj(value: string, atual?: string | null): { ok: true; value: string } | { ok: false; error: string } {
  const formatted = formatCnpj(value.trim());
  if (atual && onlyDigits(atual) === onlyDigits(value)) return { ok: true, value: atual };
  if (onlyDigits(value).length !== 14) return { ok: false, error: "CNPJ deve ter 14 dígitos." };
  if (!isCnpj(value)) return { ok: false, error: "CNPJ inválido (dígitos verificadores)." };
  return { ok: true, value: formatted };
}

/** Igual a `checarCnpj`, mas aceita CPF ou CNPJ. */
export function checarCpfCnpj(value: string, atual?: string | null): { ok: true; value: string } | { ok: false; error: string } {
  if (atual && onlyDigits(atual) === onlyDigits(value)) return { ok: true, value: atual };
  const d = onlyDigits(value);
  if (d.length !== 11 && d.length !== 14) return { ok: false, error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
  if (!isCpfOrCnpj(d)) return { ok: false, error: d.length === 11 ? "CPF inválido." : "CNPJ inválido." };
  return { ok: true, value: formatCpfCnpj(d) };
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const UF_OPTIONS = UFS.map((u) => ({ value: u, label: u }));

/** Tipo da chave Pix (nota 37): 01 telefone, 02 e-mail, 03 CPF/CNPJ, 04 aleatória. */
export function tipoChavePix(chave: string): "01" | "02" | "03" | "04" {
  const c = chave.trim();
  if (c.includes("@")) {
    if (c.length > 77) throw new ErroNegocio("E-mail da chave Pix passa de 77 caracteres (limite do manual).");
    return "02";
  }
  if (/^\+\d{13}$/.test(c)) return "01"; // nota 40: +55 + DDD + celular de 9 dígitos
  if (/^\d{11}$|^\d{14}$/.test(c)) return "03";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "04";
  throw new ErroNegocio(`Chave Pix em formato inválido: "${c}". Use +55DDDNUMERO, e-mail, CPF/CNPJ só números ou chave aleatória com traços.`);
}
