import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { curvaAbc } from "../../src/app/(app)/gestao/_lib/abc";

const it_ = (id: string, valor: number) => ({ id, codigo: id, nome: `Produto ${id}`, valor, quantidade: 1 });

describe("curva ABC", () => {
  it("classifica pelo acumulado anterior; item que cruza o limite fica na classe de cima", () => {
    // total 1000: P1 50%, P2 80% (cruza 80 e fica A), P3 90%, P4 95%
    const r = curvaAbc([it_("P3", 100), it_("P1", 500), it_("P4", 50), it_("P2", 300), it_("P6", 50)]);
    assert.deepEqual(r.linhas.map((l) => l.id), ["P1", "P2", "P3", "P4", "P6"]);
    assert.deepEqual(r.linhas.map((l) => l.participacao), [50, 30, 10, 5, 5]);
    assert.deepEqual(r.linhas.map((l) => l.acumulado), [50, 80, 90, 95, 100]);
    // P6 empata com P4 (50): ficam na mesma classe, B, em vez de P6 virar C
    assert.deepEqual(r.linhas.map((l) => l.classe), ["A", "A", "B", "B", "B"]);
    assert.deepEqual(r.contagem, { A: 2, B: 3, C: 0 });
    assert.deepEqual(r.valor, { A: 800, B: 200, C: 0 });
    assert.equal(r.total, 1000);
  });
  it("sem empate o item após 95% é C", () => {
    const r = curvaAbc([it_("A", 500), it_("B", 300), it_("C", 100), it_("D", 60), it_("E", 40)]);
    assert.deepEqual(r.linhas.map((l) => l.classe), ["A", "A", "B", "B", "C"]);
    assert.deepEqual(r.linhas.map((l) => l.acumulado), [50, 80, 90, 96, 100]);
  });
  it("empate de valor desempata por código e o primeiro item é sempre A", () => {
    const r = curvaAbc([it_("Z", 10), it_("B", 10)]);
    assert.deepEqual(r.linhas.map((l) => l.id), ["B", "Z"]);
    assert.deepEqual(r.linhas.map((l) => l.classe), ["A", "A"]);
    const um = curvaAbc([it_("X", 1)]);
    assert.equal(um.linhas[0].classe, "A");
    assert.equal(um.linhas[0].acumulado, 100);
  });
  it("centavos: 1/3 arredonda a 2 casas e o acumulado fecha em 100", () => {
    const r = curvaAbc([it_("A", 0.01), it_("B", 0.01), it_("C", 0.01)]);
    assert.deepEqual(r.linhas.map((l) => l.participacao), [33.33, 33.33, 33.33]);
    assert.deepEqual(r.linhas.map((l) => l.acumulado), [33.33, 66.67, 100]);
    assert.equal(r.total, 0.03);
  });
  it("vazio, zero e negativo não entram e não dividem por zero", () => {
    assert.deepEqual(curvaAbc([]).linhas, []);
    const r = curvaAbc([it_("A", 0), it_("B", -5)]);
    assert.equal(r.linhas.length, 0);
    assert.equal(r.total, 0);
  });
});
