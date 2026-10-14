import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularBaixa, FinanceiroError, saldoTitulo, situacaoTitulo } from "@/app/(app)/financeiro/_lib/titulos";

// Título de 1000 (exemplos do desenho de baixa com juros, multa e desconto)
test("paga 1050 com 30 de juros e 20 de multa: principal 1000, quita", () => {
  const b = calcularBaixa({ valor: 1050, juros: 30, multa: 20 }, 1000);
  assert.deepEqual(b, { valor: 1050, principal: 1000, juros: 30, multa: 20, desconto: 0 });
  assert.equal(situacaoTitulo(1000, b.principal + b.desconto), "PAGO");
});

test("paga 980 com 20 de desconto: principal 980, extingue 1000 e quita", () => {
  const b = calcularBaixa({ valor: 980, desconto: 20 }, 1000);
  assert.equal(b.principal, 980); // o dinheiro abate 980 do título
  assert.equal(b.valor, 980);
  assert.equal(situacaoTitulo(1000, b.principal + b.desconto), "PAGO"); // 980 + 20 de desconto = 1000
});

test("parcial de 600 deixa saldo de 400 e depois quita com 380 + 20 de desconto", () => {
  const p1 = calcularBaixa({ valor: 600 }, 1000);
  assert.equal(p1.principal, 600);
  assert.equal(saldoTitulo(1000, p1.principal), 400);
  assert.equal(situacaoTitulo(1000, p1.principal), "ABERTO");
  const p2 = calcularBaixa({ valor: 380, desconto: 20 }, 400);
  assert.equal(p2.principal, 380);
  assert.equal(situacaoTitulo(1000, p1.principal + p2.principal + p2.desconto), "PAGO");
});

test("pagar acima do saldo sem informar juros ou multa é erro (sem juros implícito)", () => {
  assert.throws(() => calcularBaixa({ valor: 1050 }, 1000), /informe os juros ou a multa/);
});

test("recusa valores inválidos", () => {
  assert.throws(() => calcularBaixa({ valor: 100, juros: -1 }, 1000), FinanceiroError);
  assert.throws(() => calcularBaixa({ valor: 0 }, 1000), /maior que zero/);
  assert.throws(() => calcularBaixa({ valor: 10, juros: 50 }, 1000), /não podem ser maiores/);
  assert.throws(() => calcularBaixa({ valor: Number.NaN }, 1000), FinanceiroError);
});

test("principal + desconto acima do saldo por 1 centavo é recusado; no limite é aceito", () => {
  assert.throws(() => calcularBaixa({ valor: 1000.01 - 0.0 , juros: 0, multa: 0, desconto: 0 }, 1000), FinanceiroError);
  assert.doesNotThrow(() => calcularBaixa({ valor: 1000 }, 1000));
  assert.throws(() => calcularBaixa({ valor: 990, desconto: 10.01 }, 1000), /abate/);
});

test("comparações em centavos: 0,1 + 0,2 quita 0,3", () => {
  const a = calcularBaixa({ valor: 0.1 }, 0.3);
  const b = calcularBaixa({ valor: 0.2 }, 0.3 - a.principal);
  assert.equal(situacaoTitulo(0.3, a.principal + b.principal), "PAGO");
});

test("saldoTitulo nunca é negativo e trata nulo", () => {
  assert.equal(saldoTitulo(1000, null), 1000);
  assert.equal(saldoTitulo(1000, undefined), 1000);
  assert.equal(saldoTitulo(1000, 1200), 0);
});
