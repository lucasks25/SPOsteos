import type { FormaSispag } from "./sispag";

export type ModoRemessa = "TED_BOLETO" | "PIX";

type FornecedorPag = { razaoSocial: string; cnpj: string; bancoCodigo: string | null; agencia: string | null; conta: string | null; contaDigito: string | null; chavePix: string | null } | null;

/**
 * Decide a forma de pagamento SISPAG de uma conta a pagar.
 * Boleto (código de barras) → 30/31; sem boleto → Pix (modo PIX) ou crédito Itaú (01) / TED (41).
 */
export function formaPrevista(t: { codigoBarras: string | null }, f: FornecedorPag, modo: ModoRemessa): { forma: FormaSispag } | { erro: string } {
  if (!f) return { erro: "sem fornecedor vinculado" };
  if (modo === "PIX") {
    if (t.codigoBarras) return { erro: "tem boleto: pague na remessa TED/boleto" };
    if (!f.chavePix) return { erro: "fornecedor sem chave Pix" };
    return { forma: "45" };
  }
  if (t.codigoBarras) return { forma: t.codigoBarras.startsWith("341") ? "30" : "31" };
  if (!f.bancoCodigo || !f.agencia || !f.conta || !f.contaDigito) return { erro: "fornecedor sem banco/agência/conta" };
  return { forma: f.bancoCodigo === "341" ? "01" : "41" };
}

/** "12345-6" ou "123456" → conta 12345, DAC 6 (o DAC é sempre o último dígito). */
export function contaEDac(numero: string | null | undefined): { conta: string; dac: string } | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length < 2) return null;
  return { conta: d.slice(0, -1), dac: d.slice(-1) };
}
