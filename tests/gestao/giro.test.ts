import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularGiro, type EntradaGiro } from "../../src/app/(app)/gestao/_lib/giro";

const agora = new Date("2026-10-15T15:00:00Z");
const dias = (n: number) => new Date(agora.getTime() - n * 86400000);
const base: EntradaGiro = { id: "p", codigo: "P", nome: "P", estoqueMinimo: 0, custoMedio: 10, deposito: 40, consignado: 20, quarentena: 5, naoConforme: 1, consumo: 90, ultimoConsumo: dias(2) };

describe("giro e cobertura", () => {
  it("cobertura = disponível / consumo por dia; giro anualizado; valor com todos os locais", () => {
    const l = calcularGiro(base, agora); // 90 em 90 dias = 1/dia; disponível 60
    assert.equal(l.disponivel, 60);
    assert.equal(l.total, 66);
    assert.equal(l.consumoDia, 1);
    assert.equal(l.cobertura, 60);
    assert.equal(l.giro, 6.08); // 365/60 = 6,0833
    assert.equal(l.valor, 660);
    assert.equal(l.situacao, "OK");
  });
  it("consumo zero: cobertura nula, giro 0 e nada de divisão por zero", () => {
    const l = calcularGiro({ ...base, consumo: 0, ultimoConsumo: dias(30) }, agora);
    assert.equal(l.cobertura, null);
    assert.equal(l.giro, 0);
    assert.equal(l.consumoDia, 0);
    assert.equal(l.situacao, "OK");
    const vazio = calcularGiro({ ...base, consumo: 0, deposito: 0, consignado: 0, ultimoConsumo: null }, agora);
    assert.equal(vazio.giro, null);
    assert.equal(vazio.cobertura, null);
    assert.equal(vazio.situacao, "OK"); // sem estoque e sem consumo: nada a destacar
  });
  it("arredonda a cobertura em 1 casa", () => {
    const l = calcularGiro({ ...base, consumo: 7, deposito: 10, consignado: 0 }, agora); // 10 / (7/90) = 128,571
    assert.equal(l.cobertura, 128.6);
  });
  it("ruptura: cobertura abaixo do prazo, abaixo do mínimo, ou consumo sem estoque", () => {
    assert.equal(calcularGiro({ ...base, deposito: 20, consignado: 0 }, agora).situacao, "RUPTURA"); // 20 dias < 30
    assert.equal(calcularGiro({ ...base, deposito: 20, consignado: 0 }, agora, 15).situacao, "OK"); // prazo 15
    assert.equal(calcularGiro({ ...base, consumo: 0, deposito: 3, consignado: 0, estoqueMinimo: 5, ultimoConsumo: dias(10) }, agora).situacao, "RUPTURA");
    assert.equal(calcularGiro({ ...base, deposito: 0, consignado: 0 }, agora).situacao, "RUPTURA");
  });
  it("excesso: cobertura acima de 180 dias (180 exatos não é)", () => {
    assert.equal(calcularGiro({ ...base, consumo: 9, deposito: 20, consignado: 0 }, agora).situacao, "EXCESSO"); // 20/(0,1) = 200
    assert.equal(calcularGiro({ ...base, consumo: 9, deposito: 18, consignado: 0 }, agora).situacao, "OK"); // 180
  });
  it("sem movimento: estoque e último consumo há 180+ dias ou nunca", () => {
    assert.equal(calcularGiro({ ...base, consumo: 0, ultimoConsumo: dias(180) }, agora).situacao, "SEM_MOVIMENTO");
    assert.equal(calcularGiro({ ...base, consumo: 0, ultimoConsumo: dias(179) }, agora).situacao, "OK");
    const nunca = calcularGiro({ ...base, consumo: 0, ultimoConsumo: null }, agora);
    assert.equal(nunca.situacao, "SEM_MOVIMENTO");
    assert.equal(nunca.diasSemMovimento, null);
  });
});
