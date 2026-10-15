import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { margens, ratear, type PedidoMargem } from "../../src/app/(app)/gestao/_lib/margens";

const pedidos: PedidoMargem[] = [
  {
    id: 1, hospitalId: "H1", hospital: "Hospital 1", representanteId: "R1", representante: "Rep 1", comissao: 10,
    itens: [
      { produtoId: "A", codigo: "A", descricao: "Prod A", quantidade: 2, precoUnit: 100, custoUnit: 60 }, // 200 / 120
      { produtoId: "B", codigo: "B", descricao: "Prod B", quantidade: 1, precoUnit: 50, custoUnit: 30 }, // 50 / 30
    ],
  },
  {
    id: 2, hospitalId: "H2", hospital: "Hospital 2", representanteId: null, representante: "Sem representante", comissao: 0,
    itens: [{ produtoId: "A", codigo: "A", descricao: "Prod A", quantidade: 1, precoUnit: 110, custoUnit: 60 }], // 110 / 60
  },
];

describe("margens", () => {
  it("ratear fecha a soma exata (resto no último)", () => {
    assert.deepEqual(ratear(1000, [1, 1, 1]), [333, 333, 334]);
    assert.deepEqual(ratear(1000, [20000, 5000]), [800, 200]);
    assert.deepEqual(ratear(500, [0, 0]), [0, 500]);
  });
  it("por produto: receita, custo congelado, margem % e comissão rateada", () => {
    const r = margens(pedidos);
    const a = r.produtos.find((p) => p.id === "A")!;
    assert.equal(a.receita, 310);
    assert.equal(a.custo, 180);
    assert.equal(a.margem, 130);
    assert.equal(a.margemPct, 41.94); // 130/310
    assert.equal(a.pedidos, 2);
    assert.equal(a.quantidade, 3);
    assert.equal(a.comissao, 8); // 800 dos 1000 centavos do pedido 1... ou seja R$ 8,00
    const b = r.produtos.find((p) => p.id === "B")!;
    assert.equal(b.comissao, 2);
    assert.equal(r.produtos[0].id, "A"); // maior receita primeiro
  });
  it("por hospital e representante: comissão do pedido inteira", () => {
    const r = margens(pedidos);
    const h1 = r.hospitais.find((h) => h.id === "H1")!;
    assert.deepEqual([h1.receita, h1.custo, h1.margem, h1.margemPct, h1.comissao], [250, 150, 100, 40, 10]);
    const sem = r.representantes.find((x) => x.id === "sem")!;
    assert.deepEqual([sem.receita, sem.margem, sem.comissao], [110, 50, 0]);
    assert.equal(sem.margemPct, 45.45); // 50/110
  });
  it("total confere com a soma e a soma da comissão dos produtos fecha com a dos pedidos", () => {
    const r = margens(pedidos);
    assert.deepEqual([r.total.receita, r.total.custo, r.total.margem, r.total.comissao, r.total.pedidos], [360, 210, 150, 10, 2]);
    assert.equal(r.produtos.reduce((s, p) => s + Math.round(p.comissao * 100), 0), 1000);
  });
  it("sem receita: margem % nula e sem divisão por zero; margem negativa preservada", () => {
    const r = margens([{ id: 9, hospitalId: "H", hospital: "H", representanteId: null, representante: "x", comissao: 0, itens: [{ produtoId: "Z", codigo: "Z", descricao: "Z", quantidade: 1, precoUnit: 0, custoUnit: 5 }] }]);
    assert.equal(r.produtos[0].margemPct, null);
    assert.equal(r.produtos[0].margem, -5);
    assert.equal(margens([]).total.margemPct, null);
  });
  it("arredonda em centavos (0,1 + 0,2 não vira 0,30000000000000004)", () => {
    const r = margens([{ id: 1, hospitalId: "H", hospital: "H", representanteId: null, representante: "x", comissao: 0, itens: [{ produtoId: "Z", codigo: "Z", descricao: "Z", quantidade: 3, precoUnit: 0.1, custoUnit: 0.07 }, { produtoId: "Y", codigo: "Y", descricao: "Y", quantidade: 1, precoUnit: 0.2, custoUnit: 0 }] }]);
    assert.equal(r.total.receita, 0.5);
    assert.equal(r.total.custo, 0.21);
  });
});
