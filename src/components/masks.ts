/** Máscaras visuais de campos. O servidor continua normalizando/validando. */
export type MaskKind = "cnpj" | "cpf" | "cpfcnpj" | "cep" | "tel" | "digits";

export function maskFor(name: string): MaskKind | null {
  const n = name.toLowerCase();
  if (n === "cnpj") return "cnpj";
  if (n === "cpf") return "cpf";
  if (n === "cpfcnpj") return "cpfcnpj";
  if (n === "cep") return "cep";
  if (n === "telefone" || n === "celular") return "tel";
  if (n === "agencia" || n === "conta") return "digits";
  return null;
}

const d = (v: string) => v.replace(/\D/g, "");

export function applyMask(kind: MaskKind, v: string): string {
  if (kind === "tel" && v.trim().startsWith("+")) return v;
  const x = d(v);
  switch (kind) {
    case "cnpj":
      return fmtCnpj(x.slice(0, 14));
    case "cpf":
      return fmtCpf(x.slice(0, 11));
    case "cpfcnpj":
      return x.length > 11 ? fmtCnpj(x.slice(0, 14)) : fmtCpf(x);
    case "cep":
      return x.length > 5 ? `${x.slice(0, 5)}-${x.slice(5, 8)}` : x;
    case "tel": {
      const t = x.slice(0, 11);
      if (t.length <= 2) return t;
      if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`;
      if (t.length <= 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
      return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
    }
    case "digits":
      return x;
  }
}

function fmtCnpj(x: string) {
  let o = x.slice(0, 2);
  if (x.length > 2) o += "." + x.slice(2, 5);
  if (x.length > 5) o += "." + x.slice(5, 8);
  if (x.length > 8) o += "/" + x.slice(8, 12);
  if (x.length > 12) o += "-" + x.slice(12, 14);
  return o;
}
function fmtCpf(x: string) {
  let o = x.slice(0, 3);
  if (x.length > 3) o += "." + x.slice(3, 6);
  if (x.length > 6) o += "." + x.slice(6, 9);
  if (x.length > 9) o += "-" + x.slice(9, 11);
  return o;
}

/** Aplica a máscara ao valor inicial só quando ele é um número completo (não mexe em dados legados). */
export function maskInitial(kind: MaskKind, v: string | number | readonly string[] | undefined) {
  if (typeof v !== "string" || !v) return v;
  const len = d(v).length;
  const completo = { cnpj: [14], cpf: [11], cpfcnpj: [11, 14], cep: [8], tel: [10, 11], digits: [] as number[] }[kind];
  return completo.includes(len) ? applyMask(kind, v) : v;
}

/** Reaplica a máscara num input preservando a posição do cursor (contada em dígitos). */
export function maskInput(el: HTMLInputElement, kind: MaskKind) {
  const pos = el.selectionStart ?? el.value.length;
  const digitsBefore = d(el.value.slice(0, pos)).length;
  const novo = applyMask(kind, el.value);
  if (novo === el.value) return;
  el.value = novo;
  let c = 0;
  let i = 0;
  while (i < novo.length && c < digitsBefore) if (/\d/.test(novo[i++])) c++;
  try {
    el.setSelectionRange(i, i);
  } catch {}
}

export const MONEY_RE = /^(valor\w*|preco\w*|juros|multa|desconto|saldoInicial)$/;
