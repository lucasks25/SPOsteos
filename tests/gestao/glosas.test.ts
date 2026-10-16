import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { percentual, resumirGlosas, type GlosaLinha, type PedidoFaturadoGlosa } from "../../src/app/(app)/gestao/_lib/glosas";

const ped = (convenioId: string | null, hospitalId: string, total: number): PedidoFaturadoGlosa => ({ convenioId, convenio: convenioId ?? "Sem convênio", hospitalId, hospital: `Hosp ${hospitalId}`, total });
const glo = (convenioId: string | null, hospitalId: string, categoria: GlosaLinha["categoria"], valor: number, recurso: GlosaLinha["recurso"] = "NENHUM"): GlosaLinha => ({ valor, categoria, recurso, convenioId, convenio: convenioId ?? "Sem convênio", hospitalId, hospital: `Hosp ${hospitalId}` });

describe("percentual", () => {
  it("duas casas e sem divisão por zero", () => {
    assert.equal(percentual(1, 3), 33.33);
    assert.equal(percentual(2, 3), 66.67);
    assert.equal(percentual(5, 0), null);
    assert.equal(percentual(0, 100), 0);
  });
});

describe("glosas por convênio e motivo", () => {
  // conferido à mão: faturado 1000,10 + 499,90 + 2000,00 = 3500,00; glosado 100,05 + 49,95 + 300,00 + 0,10 = 450,10
  const pedidos = [ped("A", "H1", 1000.1), ped("A", "H2", 499.9), ped("B", "H1", 2000)];
  const glosas = [glo("A", "H1", "SEM_AUTORIZACAO", 100.05), glo("A", "H2", "SEM_AUTORIZACAO", 49.95, "EM_RECURSO"), glo("B", "H1", "LINEAR", 300, "REVERTIDA"), glo(null, "H1", "OUTRA", 0.1, "MANTIDA")];
  const r = resumirGlosas(pedidos, glosas);

  it("totais, percentual e situação do recurso", () => {
    assert.equal(r.faturado, 3500);
    assert.equal(r.glosado, 450.1);
    assert.equal(r.qtd, 4);
    assert.equal(r.pct, 12.86); // 450,10 / 3500 = 12,8600%
    assert.deepEqual(r.emRecurso, { valor: 49.95, qtd: 1 });
    assert.deepEqual(r.revertidas, { valor: 300, qtd: 1 });
    assert.deepEqual(r.mantidas, { valor: 0.1, qtd: 1 });
    assert.equal(r.liquido, 150.1);
  });

  it("por categoria, do maior valor ao menor, com % do total glosado", () => {
    assert.deepEqual(r.porCategoria, [
      { categoria: "LINEAR", valor: 300, qtd: 1, pctDoTotal: 66.65 }, // 300 / 450,10
      { categoria: "SEM_AUTORIZACAO", valor: 150, qtd: 2, pctDoTotal: 33.33 }, // 150 / 450,10
      { categoria: "OUTRA", valor: 0.1, qtd: 1, pctDoTotal: 0.02 }, // 0,10 / 450,10
    ]);
  });

  it("por convênio e por hospital: faturado, glosado e % de glosa (faturado zero vira null)", () => {
    assert.deepEqual(r.porConvenio, [
      { id: "B", nome: "B", faturado: 2000, glosado: 300, qtd: 1, pct: 15 },
      { id: "A", nome: "A", faturado: 1500, glosado: 150, qtd: 2, pct: 10 },
      { id: "sem-convenio", nome: "Sem convênio", faturado: 0, glosado: 0.1, qtd: 1, pct: null },
    ]);
    assert.deepEqual(r.porHospital, [
      { id: "H1", nome: "Hosp H1", faturado: 3000.1, glosado: 400.15, qtd: 3, pct: 13.34 }, // 400,15 / 3000,10
      { id: "H2", nome: "Hosp H2", faturado: 499.9, glosado: 49.95, qtd: 1, pct: 9.99 }, // 49,95 / 499,90
    ]);
  });

  it("sem faturamento no período: percentuais nulos e sem erro; sem glosa: tudo zero", () => {
    const so = resumirGlosas([], [glo("A", "H1", "TECNICA", 10)]);
    assert.equal(so.pct, null);
    assert.equal(so.porConvenio[0].pct, null);
    const nada = resumirGlosas([ped("A", "H1", 100)], []);
    assert.deepEqual([nada.glosado, nada.pct, nada.porCategoria.length, nada.liquido], [0, 0, 0, 0]);
    assert.equal(nada.porConvenio[0].pct, 0);
  });
});
