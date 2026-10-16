import assert from "node:assert/strict";
import { test } from "node:test";
import { divergenciaBoleto, dvBarras, fatorDoVencimento } from "../../src/app/(app)/financeiro/_lib/boleto";
import { codigoBarras44, fatorVencimento } from "../../src/app/(app)/financeiro/_lib/cobranca";

const ben = { agencia: "0057", conta: "72192", dac: "0", carteira: "109" as const };
const venc = new Date("2026-11-20T00:00:00Z");
const barras = (valorCentavos: number, vencimento = venc) => codigoBarras44(ben, { nossoNumero: "12345678", vencimento, valorCentavos });

test("fator de vencimento: mesmo cálculo da cobrança, com o reinício de 22/02/2025", () => {
  assert.equal(fatorDoVencimento(new Date("2000-07-03T00:00:00Z")), 1000);
  assert.equal(fatorDoVencimento(new Date("2025-02-21T00:00:00Z")), 9999);
  assert.equal(fatorDoVencimento(new Date("2025-02-22T00:00:00Z")), 1000);
  assert.equal(fatorDoVencimento(venc), fatorVencimento(venc));
  assert.equal(fatorDoVencimento(new Date("2000-07-02T00:00:00Z")), null);
});

test("boleto do fornecedor: valor e vencimento do código de barras precisam ser os do título", () => {
  const b = barras(123456);
  assert.equal(divergenciaBoleto(b, { valor: 1234.56, vencimento: venc }), null);
  assert.match(divergenciaBoleto(b, { valor: 1234.55, vencimento: venc }) ?? "", /boleto é de R\$\s?1\.234,56.*título está com R\$\s?1\.234,55/);
  assert.match(divergenciaBoleto(b, { valor: 1234.56, vencimento: new Date("2026-11-21T00:00:00Z") }) ?? "", /boleto vence em 20\/11\/2026.*21\/11\/2026/);
});

test("boleto sem valor impresso (zeros) não é conferido", () => {
  const b = barras(100);
  const semValor43 = b.slice(0, 4) + b.slice(5, 9) + "0".repeat(10) + b.slice(19);
  const zerado = semValor43.slice(0, 4) + dvBarras(semValor43) + semValor43.slice(4);
  assert.equal(divergenciaBoleto(zerado, { valor: 999, vencimento: new Date("2030-01-01T00:00:00Z") }), null);
});
