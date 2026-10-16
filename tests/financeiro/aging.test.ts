import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agingPorParceiro, faixaAtraso } from "../../src/app/(app)/financeiro/_lib/aging";
import { csv } from "../../src/lib/csv";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const hoje = d("2026-10-15");

describe("aging", () => {
  it("faixas pelo atraso: vence hoje não é atraso", () => {
    assert.equal(faixaAtraso(d("2026-10-15"), hoje), 0);
    assert.equal(faixaAtraso(d("2026-10-20"), hoje), 0);
    assert.equal(faixaAtraso(d("2026-10-14"), hoje), 1);
    assert.equal(faixaAtraso(d("2026-09-15"), hoje), 1); // 30 dias
    assert.equal(faixaAtraso(d("2026-09-14"), hoje), 2); // 31
    assert.equal(faixaAtraso(d("2026-08-16"), hoje), 2); // 60 dias
    assert.equal(faixaAtraso(d("2026-08-15"), hoje), 3); // 61
  });
  it("agrupa por parceiro, soma por faixa e ordena pelo maior vencido", () => {
    const r = agingPorParceiro(
      [
        { parceiroId: "a", parceiro: "Hosp A", saldo: 100.1, vencimento: d("2026-10-10") },
        { parceiroId: "a", parceiro: "Hosp A", saldo: 200.2, vencimento: d("2026-12-01") },
        { parceiroId: "b", parceiro: "Hosp B", saldo: 500, vencimento: d("2026-06-01") },
        { parceiroId: "b", parceiro: "Hosp B", saldo: 0, vencimento: d("2026-01-01") }, // sem saldo: ignora
      ],
      hoje,
    );
    assert.deepEqual(r.linhas.map((l) => l.parceiro), ["Hosp B", "Hosp A"]);
    const a = r.linhas[1];
    assert.deepEqual(a.faixas, [200.2, 100.1, 0, 0, 0]);
    assert.equal(a.total, 300.3);
    assert.equal(a.vencido, 100.1);
    assert.equal(r.linhas[0].faixas[4], 500);
    assert.equal(r.total, 800.3);
    assert.equal(r.linhas[0].maiorAtrasoDias, 136);
  });
  it("CSV: vírgula decimal, ponto e vírgula, aspas e neutraliza fórmula", () => {
    const t = csv([["a;b", 1.5, '=CMD("x")']]);
    assert.ok(t.startsWith("﻿"));
    assert.equal(t.slice(1).trim(), `"a;b";1,50;"'=CMD(""x"")"`);
  });
});
