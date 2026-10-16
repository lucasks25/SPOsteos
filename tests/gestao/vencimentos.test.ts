import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDias } from "@/lib/datas";
import { faixaVencimento, lotesEmRisco, riscoPorHospital, totaisPorFaixa, type SaldoLote } from "../../src/app/(app)/gestao/_lib/vencimentos";

const hoje = new Date("2026-10-15T00:00:00Z");
const v = (n: number) => addDias(hoje, n);

describe("vencimentos", () => {
  it("faixas nas bordas: 30, 60, 90 e 180 dias", () => {
    const f = (n: number) => faixaVencimento(v(n), hoje);
    assert.deepEqual([-1, 0, 30, 31, 60, 61, 90, 91, 180, 181].map(f), [0, 1, 1, 2, 2, 3, 3, 4, 4, -1]);
  });
  const s = (o: Partial<SaldoLote>): SaldoLote => ({ loteId: "L1", lote: "L1", produtoId: "P", codigo: "P", produto: "P", validade: v(10), quantidade: 2, custoMedio: 50.5, localTipo: "DEPOSITO", hospitalId: null, hospital: null, ...o });
  it("valor em risco = saldo × custo médio em centavos; ignora zero, não conforme e além de 180 dias", () => {
    const l = lotesEmRisco([s({}), s({ quantidade: 0 }), s({ localTipo: "NAO_CONFORME" }), s({ validade: v(200) }), s({ loteId: "L2", validade: v(-3), quantidade: 3, custoMedio: 0.1 })], hoje);
    assert.equal(l.length, 2);
    assert.equal(l[0].loteId, "L2"); // vencido primeiro
    assert.equal(l[0].valor, 0.3);
    assert.equal(l[1].valor, 101);
    const t = totaisPorFaixa(l);
    assert.deepEqual(t.valor, [0.3, 101, 0, 0, 0]);
    assert.equal(t.total, 101.3);
    assert.deepEqual(t.quantidade, [3, 2, 0, 0, 0]);
  });
  it("por hospital só considera consignado", () => {
    const l = lotesEmRisco([
      s({ localTipo: "HOSPITAL", hospitalId: "H1", hospital: "Hosp 1", validade: v(45), quantidade: 4, custoMedio: 100 }),
      s({ loteId: "L3", localTipo: "HOSPITAL", hospitalId: "H1", hospital: "Hosp 1", validade: v(5), quantidade: 1, custoMedio: 100 }),
      s({ loteId: "L4", localTipo: "HOSPITAL", hospitalId: "H2", hospital: "Hosp 2", validade: v(100), quantidade: 10, custoMedio: 100 }),
      s({}),
    ], hoje);
    const h = riscoPorHospital(l);
    assert.deepEqual(h.map((x) => [x.hospital, x.total, x.lotes]), [["Hosp 2", 1000, 1], ["Hosp 1", 500, 2]]);
    assert.deepEqual(h[1].faixas, [0, 100, 400, 0, 0]);
  });
});
