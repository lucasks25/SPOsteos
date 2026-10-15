import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { periodoDe, qs } from "../../src/app/(app)/gestao/_lib/periodo";

const hoje = new Date("2026-10-15T00:00:00Z");

describe("período", () => {
  it("padrão: últimos 90 dias incluindo hoje; fim exclusivo no início do dia seguinte em Brasília", () => {
    const p = periodoDe(undefined, undefined, hoje);
    assert.equal(p.ate, "2026-10-15");
    assert.equal(p.de, "2026-07-18"); // 90 dias contando hoje
    assert.equal(p.gte.toISOString(), "2026-07-18T03:00:00.000Z");
    assert.equal(p.lt.toISOString(), "2026-10-16T03:00:00.000Z");
  });
  it("datas informadas, trocadas se invertidas, inválidas caem no padrão", () => {
    const p = periodoDe("2026-03-31", "2026-03-01", hoje);
    assert.deepEqual([p.de, p.ate], ["2026-03-01", "2026-03-31"]);
    const q = periodoDe("lixo", "2026-02-30x", hoje, 30);
    assert.deepEqual([q.de, q.ate], ["2026-09-16", "2026-10-15"]);
  });
  it("qs ignora vazios", () => {
    assert.equal(qs({ a: "1", b: "", c: undefined, d: "x y" }), "a=1&d=x+y");
  });
});
