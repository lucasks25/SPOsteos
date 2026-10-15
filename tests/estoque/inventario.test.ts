/** Regras puras do inventário de consignado. Valores conferidos à mão. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularItem, planoMovimento, resumirInventario, validarResolucao, valorACobrar, valorLinha } from "@/app/(app)/estoque/_lib/inventario";

test("falta: sistema 10, contado 7, custo 25,50 → -3 un. = -76,50", () => {
  const r = calcularItem({ saldoSistema: 10, saldoAtual: 10, contado: 7, valorUnit: 25.5 });
  assert.deepEqual(r, { situacao: "FALTA", diferenca: -3, diferencaFoto: -3, saldoMudou: false, valor: -76.5 });
});

test("sobra: sistema 4, contado 6, custo 100 → +2 un. = +200", () => {
  const r = calcularItem({ saldoSistema: 4, saldoAtual: 4, contado: 6, valorUnit: 100 });
  assert.equal(r.situacao, "SOBRA");
  assert.equal(r.diferenca, 2);
  assert.equal(r.valor, 200);
});

test("confere e não contado", () => {
  assert.equal(calcularItem({ saldoSistema: 5, saldoAtual: 5, contado: 5, valorUnit: 9 }).situacao, "OK");
  const nc = calcularItem({ saldoSistema: 5, saldoAtual: 5, contado: null, valorUnit: 9 });
  assert.equal(nc.situacao, "NAO_CONTADO");
  assert.equal(nc.diferenca, null);
  assert.equal(nc.valor, 0);
});

test("lote novo (não estava na foto): sistema 0, contado 3, custo 10 → sobra de 3 = +30", () => {
  const r = calcularItem({ saldoSistema: 0, saldoAtual: 0, contado: 3, valorUnit: 10 });
  assert.equal(r.situacao, "SOBRA");
  assert.equal(r.valor, 30);
});

test("saldo mudou depois da foto: foto 10, hoje 6 (4 consumidos), contado 6 → confere hoje; contra a foto seria -4", () => {
  const r = calcularItem({ saldoSistema: 10, saldoAtual: 6, contado: 6, valorUnit: 50 });
  assert.equal(r.saldoMudou, true);
  assert.equal(r.situacao, "OK");
  assert.equal(r.diferenca, 0);
  assert.equal(r.diferencaFoto, -4);
  // e o contrário: foto 10, hoje 12 (retorno), contado 10 → falta de 2 contra o saldo de hoje
  const s = calcularItem({ saldoSistema: 10, saldoAtual: 12, contado: 10, valorUnit: 50 });
  assert.equal(s.diferenca, -2);
  assert.equal(s.diferencaFoto, 0);
  assert.equal(s.valor, -100);
});

test("arredondamento em centavos: 3 × 0,07 = 0,21 e 3 × 33,33 = 99,99 (sem erro de ponto flutuante)", () => {
  assert.equal(valorLinha(3, 0.07), 0.21);
  assert.equal(valorLinha(-3, 33.33), -99.99);
  assert.equal(valorLinha(7, 0.1), 0.7);
});

test("resumo: 4 itens (falta 3×25,50; falta 1×0,07; sobra 2×100; ok) + 1 não contado", () => {
  const rs = [
    calcularItem({ saldoSistema: 10, saldoAtual: 10, contado: 7, valorUnit: 25.5 }),
    calcularItem({ saldoSistema: 2, saldoAtual: 2, contado: 1, valorUnit: 0.07 }),
    calcularItem({ saldoSistema: 4, saldoAtual: 4, contado: 6, valorUnit: 100 }),
    calcularItem({ saldoSistema: 5, saldoAtual: 4, contado: 4, valorUnit: 9 }),
    calcularItem({ saldoSistema: 1, saldoAtual: 1, contado: null, valorUnit: 9 }),
  ];
  assert.deepEqual(resumirInventario(rs), {
    itens: 5,
    contados: 4,
    naoContados: 1,
    divergentes: 3,
    unidadesFalta: 4,
    unidadesSobra: 2,
    valorFalta: 76.57, // 76,50 + 0,07
    valorSobra: 200,
    saldoMudou: 1,
  });
});

test("resolução: divergência exige escolha; justificada exige texto; cobrar só em falta", () => {
  assert.equal(validarResolucao(0, null, null), null);
  assert.match(validarResolucao(-1, null, null) ?? "", /Escolha/);
  assert.match(validarResolucao(-1, "JUSTIFICADA", "  ") ?? "", /justificativa/);
  assert.equal(validarResolucao(-1, "JUSTIFICADA", "extraviado em transporte"), null);
  assert.match(validarResolucao(2, "COBRAR_HOSPITAL", null) ?? "", /só vale para falta/);
  assert.equal(validarResolucao(-2, "COBRAR_HOSPITAL", null), null);
  assert.equal(validarResolucao(2, "AJUSTE", null), null);
});

test("plano de movimento: sobra=AJUSTE entrada; falta ajustada=PERDA; falta cobrada=AJUSTE saída; justificada não move", () => {
  assert.deepEqual(planoMovimento(2, "AJUSTE"), { tipo: "AJUSTE", entrada: true, quantidade: 2 });
  assert.deepEqual(planoMovimento(-3, "AJUSTE"), { tipo: "PERDA", entrada: false, quantidade: 3 });
  assert.deepEqual(planoMovimento(-3, "COBRAR_HOSPITAL"), { tipo: "AJUSTE", entrada: false, quantidade: 3 });
  assert.equal(planoMovimento(-3, "JUSTIFICADA"), null);
  assert.equal(planoMovimento(0, "AJUSTE"), null);
});

test("valor a cobrar: só falta cobrada, ao custo congelado", () => {
  assert.equal(valorACobrar(-3, 25.5, "COBRAR_HOSPITAL"), 76.5);
  assert.equal(valorACobrar(-3, 25.5, "AJUSTE"), null);
  assert.equal(valorACobrar(2, 25.5, "COBRAR_HOSPITAL"), null);
});
