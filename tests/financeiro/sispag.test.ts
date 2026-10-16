import assert from "node:assert/strict";
import { test } from "node:test";
import { BoletoError, lerBoleto, linhaDigitavel, mod10 } from "@/app/(app)/financeiro/_lib/boleto";
import { gerarRemessaSispag, lerRetornoSispag, situacaoRetorno, type Empresa } from "@/app/(app)/financeiro/_lib/sispag";
import { tipoChavePix } from "@/lib/documentos-br";
import { ErroNegocio } from "@/lib/erros";
import { contaEDac, formaPrevista } from "@/app/(app)/financeiro/_lib/sispag-regras";

// Exemplo oficial do Anexo A do manual SISPAG Itaú v085
const BARRAS = "34196166700000123451101234567880057123457000";
const LINHA = "34191.10121 34567.880058 71234.570001 6 16670000012345";

test("boleto: DVs do Anexo A e conversão linha digitável ↔ código de barras", () => {
  assert.equal(mod10("341911012"), 1);
  assert.equal(mod10("3456788005"), 8);
  assert.equal(mod10("7123457000"), 1);
  const b = lerBoleto(LINHA);
  assert.equal(b.codigoBarras, BARRAS);
  assert.equal(b.valor, 123.45);
  assert.equal(linhaDigitavel(BARRAS), LINHA);
  assert.equal(lerBoleto(BARRAS).codigoBarras, BARRAS);
});

test("boleto: rejeita DV errado, convênio/tributo e tamanho inválido", () => {
  assert.throws(() => lerBoleto(BARRAS.slice(0, 4) + "7" + BARRAS.slice(5)), /dígito verificador/);
  assert.throws(() => lerBoleto("34191.10120 34567.880058 71234.570001 6 16670000012345"), /campo 1/);
  assert.throws(() => lerBoleto("8".repeat(48)), BoletoError);
  assert.throws(() => lerBoleto("123"), BoletoError);
});

test("chave Pix: tipo pela nota 37", () => {
  assert.equal(tipoChavePix("financeiro@forn.com.br"), "02");
  assert.equal(tipoChavePix("+5511987654321"), "01");
  assert.equal(tipoChavePix("99999999000191"), "03");
  assert.equal(tipoChavePix("123e4567-e89b-12d3-a456-426614174000"), "04");
  assert.throws(() => tipoChavePix("11 98765-4321"), ErroNegocio);
});

const emp: Empresa = { cnpj: "99999999000191", nome: "Distribuidora OPME Ltda", agencia: "0123", conta: "12345", dac: "6" };
const d = new Date("2026-10-20T00:00:00Z");
const fav = (nome: string, extra = {}) => ({ nome, documento: "99999999000272", banco: "033", agencia: "1234", conta: "556677", digito: "8", ...extra });
const c = (l: string, i: number, f: number) => l.slice(i - 1, f);

function remessaMista() {
  return gerarRemessaSispag(
    emp,
    [
      { forma: "41", seuNumero: "SP1", data: d, valor: 19200, favorecido: fav("Fornecedor Ação Ltda") },
      { forma: "01", seuNumero: "SP2", data: d, valor: 50.5, favorecido: fav("Forn Itau", { banco: "341" }) },
      { forma: "30", seuNumero: "SP3", data: d, valor: 123.45, codigoBarras: BARRAS, vencimento: d, valorTitulo: 123.45, favorecido: fav("Forn Boleto") },
    ],
    new Date("2026-10-16T13:05:09Z"),
  );
}

test("remessa: estrutura, lotes por forma e posições dos campos", () => {
  const L = remessaMista().split("\r\n").filter(Boolean);
  for (const l of L) assert.equal(l.length, 240);
  assert.equal(c(L[0], 1, 8), "34100000");
  assert.equal(c(L[0], 143, 157), "116102026100509");
  assert.equal(c(L[0], 53, 72), "00123 000000012345 6");
  // lote 1: forma 01 (crédito Itaú)
  assert.equal(c(L[1], 8, 16), "1C2001040");
  assert.equal(c(L[2], 24, 43), "01234 000000556677 8");
  assert.equal(c(L[2], 74, 93).trim(), "SP2");
  assert.equal(c(L[2], 120, 134), "000000000005050");
  assert.equal(c(L[4], 18, 41), "000004000000000000005050");
  // lote 2: TED
  assert.equal(c(L[5], 12, 13), "41");
  assert.equal(c(L[6], 21, 43), "03301234 000000556677 8");
  assert.equal(c(L[6], 220, 224), "00005");
  assert.equal(c(L[6], 44, 73).trim(), "FORNECEDOR ACAO LTDA");
  // lote 3: boleto outro banco (J + J-52)
  assert.equal(c(L[9], 12, 16), "30030"); // boleto Itaú (341 no código de barras) = forma 30
  assert.equal(c(L[10], 18, 61), BARRAS);
  assert.equal(c(L[11], 14, 19), "J00052");
  // trailer de arquivo
  assert.equal(c(L.at(-1)!, 18, 23), "000003");
  assert.equal(Number(c(L.at(-1)!, 24, 29)), L.length);
});

test("remessa Pix: arquivo próprio, câmara 009 e chave no segmento B", () => {
  const L = gerarRemessaSispag(emp, [{ forma: "45", seuNumero: "SP9", data: d, valor: 10, favorecido: fav("Forn Pix", { chavePix: "Financeiro@Forn.com.br" }) }], new Date()).split("\r\n").filter(Boolean);
  assert.equal(c(L[2], 18, 20), "009");
  assert.equal(c(L[2], 113, 114), "04");
  assert.equal(c(L[3], 15, 16), "02");
  assert.equal(c(L[3], 128, 227).trim(), "Financeiro@Forn.com.br");
  assert.throws(
    () => gerarRemessaSispag(emp, [{ forma: "45", seuNumero: "x", data: d, valor: 1, favorecido: fav("a", { chavePix: "a@b.c" }) }, { forma: "41", seuNumero: "y", data: d, valor: 1, favorecido: fav("b") }], new Date()),
    /arquivo separado/,
  );
  assert.throws(() => gerarRemessaSispag(emp, [{ forma: "41", seuNumero: "y", data: d, valor: 1, favorecido: fav("b", { conta: null }) }], new Date()), /agência\/conta/);
});

test("retorno: pago, agendado e rejeitado; recusa arquivo de remessa", () => {
  const rem = remessaMista();
  const put = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);
  const ret = rem
    .split("\r\n")
    .map((l, i) => {
      let r = l;
      if (i === 0) r = put(r, 143, "2");
      if (i === 2) r = put(put(put(r, 231, "00        "), 155, "20102026"), 163, "000000000005050");
      if (i === 6) r = put(r, 231, "BD        ");
      if (i === 10) r = put(r, 231, "IP        ");
      return r;
    })
    .join("\r\n");
  const res = Object.fromEntries(lerRetornoSispag(ret).map((r) => [r.seuNumero, r]));
  assert.equal(situacaoRetorno(res.SP2.ocorrencias), "PAGO");
  assert.equal(res.SP2.valorEfetivo, 50.5);
  assert.equal(res.SP2.dataEfetiva?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(situacaoRetorno(res.SP1.ocorrencias), "AGENDADO");
  assert.equal(situacaoRetorno(res.SP3.ocorrencias), "REJEITADO");
  assert.throws(() => lerRetornoSispag(rem), /remessa/);
});

test("regras: forma prevista e conta com dígito", () => {
  const f = { razaoSocial: "F", cnpj: "x", bancoCodigo: "033", agencia: "1", conta: "2", contaDigito: "3", chavePix: "a@b.com" };
  assert.deepEqual(formaPrevista({ codigoBarras: BARRAS }, f, "TED_BOLETO"), { forma: "30" });
  assert.deepEqual(formaPrevista({ codigoBarras: null }, f, "TED_BOLETO"), { forma: "41" });
  assert.deepEqual(formaPrevista({ codigoBarras: null }, { ...f, bancoCodigo: "341" }, "TED_BOLETO"), { forma: "01" });
  assert.deepEqual(formaPrevista({ codigoBarras: null }, f, "PIX"), { forma: "45" });
  assert.ok("erro" in formaPrevista({ codigoBarras: BARRAS }, f, "PIX"));
  assert.ok("erro" in formaPrevista({ codigoBarras: null }, null, "TED_BOLETO"));
  assert.deepEqual(contaEDac("12345-6"), { conta: "12345", dac: "6" });
  assert.equal(contaEDac("7"), null);
});

test("header do arquivo usa data e hora de Brasília (23h em Brasília ainda é o mesmo dia)", () => {
  const empresa = { cnpj: "12345678000195", nome: "EMPRESA", agencia: "1234", conta: "12345", dac: "6" };
  const pg = [{ forma: "01" as const, seuNumero: "SP1", data: new Date("2026-10-20T00:00:00Z"), valor: 10, favorecido: { nome: "F", documento: "11222333000181", banco: "341", agencia: "4321", conta: "98765", digito: "0", chavePix: null } }];
  const header = gerarRemessaSispag(empresa, pg, new Date("2026-10-15T02:30:00Z")).split(/\r?\n/)[0]; // 14/10 23:30 em Brasília
  assert.equal(header.slice(143, 151), "14102026");
  assert.equal(header.slice(151, 157), "233000");
});

test("chave Pix: telefone exige +55 e 11 dígitos; e-mail até 77 caracteres (nota 40)", () => {
  assert.throws(() => tipoChavePix("+551187654321"), /inválido/);
  assert.throws(() => tipoChavePix(`${"a".repeat(80)}@x.com`), /77/);
});
