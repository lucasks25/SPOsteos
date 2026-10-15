import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inicioMesBrasilia, mesBrasilia, ultimos12Meses, vendasPorMes } from "../../src/app/(app)/gestao/_lib/vendas-mes";

describe("vendas por mês", () => {
  it("mês pelo fuso de Brasília: 1º de outubro 02:00Z ainda é setembro", () => {
    assert.deepEqual(mesBrasilia(new Date("2026-10-01T02:59:59Z")), { ano: 2026, mes: 9 });
    assert.deepEqual(mesBrasilia(new Date("2026-10-01T03:00:00Z")), { ano: 2026, mes: 10 });
    assert.equal(inicioMesBrasilia(2026, 10).toISOString(), "2026-10-01T03:00:00.000Z");
  });
  it("12 meses atravessando o ano", () => {
    const m = ultimos12Meses({ ano: 2026, mes: 2 });
    assert.deepEqual([m[0], m[11]], [{ ano: 2025, mes: 3 }, { ano: 2026, mes: 2 }]);
    assert.equal(m.length, 12);
  });
  it("soma por mês, compara com o mesmo mês do ano anterior e não divide por zero", () => {
    const r = vendasPorMes(
      [
        { faturadoEm: new Date("2026-10-05T12:00:00Z"), total: 1000.1 },
        { faturadoEm: new Date("2026-10-20T12:00:00Z"), total: 499.9 },
        { faturadoEm: new Date("2025-10-10T12:00:00Z"), total: 1000 },
        { faturadoEm: new Date("2026-09-30T23:00:00Z"), total: 200 }, // 20:00 BRT de 30/09
        { faturadoEm: new Date("2026-10-01T02:00:00Z"), total: 50 }, // 23:00 BRT de 30/09: setembro
      ],
      { ano: 2026, mes: 10 },
    );
    const out = r[11];
    assert.deepEqual([out.chave, out.valor, out.pedidos, out.anterior, out.variacaoPct], ["2026-10", 1500, 2, 1000, 50]);
    const set = r[10];
    assert.deepEqual([set.chave, set.valor, set.pedidos, set.anterior, set.variacaoPct], ["2026-09", 250, 2, 0, null]);
  });
});

import { janelaVendas } from "../../src/app/(app)/gestao/_lib/vendas-mes";
describe("janela de consulta", () => {
  it("24 meses terminando em fim, fim exclusivo", () => {
    const j = janelaVendas({ ano: 2026, mes: 10 });
    assert.equal(j.gte.toISOString(), "2024-11-01T03:00:00.000Z");
    assert.equal(j.lt.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(janelaVendas({ ano: 2026, mes: 12 }).lt.toISOString(), "2027-01-01T03:00:00.000Z");
  });
});
