import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularCustoImportacao,
  integraCustoPadrao,
  ratear,
  valorAcumuladoCent,
  valorEmReaisCent,
  valorRecebimentoCent,
  type DespesaCusto,
  type ItemCusto,
} from "../../src/app/(app)/compras/_lib/custo-importacao";

const d = (id: string, tipo: DespesaCusto["tipo"], valor: number, criterio: DespesaCusto["criterio"], extra: Partial<DespesaCusto> = {}): DespesaCusto => ({
  id,
  tipo,
  valor,
  criterio,
  integraCusto: integraCustoPadrao(tipo),
  ...extra,
});

const b = (...xs: number[]) => xs.map((x) => BigInt(x));

describe("custo nacionalizado (landed cost)", () => {
  it("exemplo em USD conferido à mão: 3 itens, rateio por valor, quantidade, peso, despesa de um item e tributo que não integra", () => {
    const itens: ItemCusto[] = [
      { id: "A", quantidade: 10, precoMoeda: 12.5, pesoKg: 2.5 }, // 125,00 USD × 5,4321 = 679,0125 → R$ 679,01
      { id: "B", quantidade: 3, precoMoeda: 99.99, pesoKg: 1.2 }, // 299,97 × 5,4321 = 1.629,467037 → R$ 1.629,47
      { id: "C", quantidade: 7, precoMoeda: 0.3333, pesoKg: 0.35 }, // 2,3331 × 5,4321 = 12,67363251 → R$ 12,67
    ];
    const despesas = [
      d("frete", "FRETE_INTERNACIONAL", 100, "VALOR"), // bases 67901/162947/1267 (232115): 2925,31→2925; 7020,09→7020; sobra 55
      d("desp", "DESPACHANTE", 1000, "QUANTIDADE"), // 10/3/7 de 20: 500,00; 150,00; 350,00
      d("ii", "II", 300, "VALOR", { itemId: "B" }), // só no item B
      d("seg", "SEGURO", 10, "PESO"), // 2500/1200/350 g de 4050: 6,17; 2,96; sobra 0,87
      d("icms", "ICMS", 500, "VALOR"), // recuperável: não integra (padrão)
    ];
    const r = calcularCustoImportacao(itens, despesas, 5.4321);
    assert.deepEqual(r.linhas.map((l) => l.valorReaisCent), [67901, 162947, 1267]);
    assert.deepEqual(r.linhas.map((l) => l.porDespesa), [
      { frete: 2925, desp: 50000, seg: 617 },
      { frete: 7020, desp: 15000, ii: 30000, seg: 296 },
      { frete: 55, desp: 35000, seg: 87 },
    ]);
    assert.deepEqual(r.linhas.map((l) => l.rateioCent), [53542, 52316, 35142]);
    assert.deepEqual(r.linhas.map((l) => l.totalCent), [121443, 215263, 36409]);
    // 1.214,43 / 10 = 121,443; 2.152,63 / 3 = 717,5433...; 364,09 / 7 = 52,0128571...
    assert.deepEqual(r.linhas.map((l) => l.custoUnit), [121.443, 717.5433, 52.0129]);
    assert.equal(r.totalMercadoriaCent, 232115);
    assert.equal(r.totalRateadoCent, 141000); // 100 + 1000 + 300 + 10: nenhum centavo perdido
    assert.equal(r.naoIntegraCent, 50000);
    assert.equal(r.totalCent, 373115);
    assert.equal(r.linhas.reduce((s, l) => s + l.totalCent, 0), r.totalCent);
  });

  it("segunda moeda (EUR), rateio por quantidade com sobra no último item", () => {
    const r = calcularCustoImportacao(
      [
        { id: "X", quantidade: 2, precoMoeda: 1000 }, // 2.000 × 6,1 = R$ 12.200,00
        { id: "Y", quantidade: 1, precoMoeda: 333.33 }, // 333,33 × 6,1 = 2.033,313 → R$ 2.033,31
      ],
      [d("f", "FRETE_INTERNACIONAL", 100, "QUANTIDADE")], // 2/3 de 100,00 = 66,666 → 66,66; sobra 33,34
      6.1,
    );
    assert.deepEqual(r.linhas.map((l) => [l.valorReaisCent, l.rateioCent, l.totalCent, l.custoUnit]), [
      [1220000, 6666, 1226666, 6133.33],
      [203331, 3334, 206665, 2066.65],
    ]);
  });

  it("pedido em reais: câmbio 1, despesa que não integra o custo não muda o custo unitário", () => {
    const r = calcularCustoImportacao([{ id: "A", quantidade: 4, precoMoeda: 25 }], [d("pis", "PIS_IMPORTACAO", 80, "VALOR"), d("cof", "COFINS_IMPORTACAO", 1, "VALOR", { integraCusto: true })], 1);
    assert.equal(r.linhas[0].custoUnit, 25.25);
    assert.equal(r.naoIntegraCent, 8000);
  });

  it("ratear: centavo de sobra vai para o último item com base", () => {
    assert.deepEqual(ratear(100, b(1, 1, 1)), [33, 33, 34]);
    assert.deepEqual(ratear(1, b(1, 1, 1)), [0, 0, 1]);
    assert.deepEqual(ratear(101, b(1, 1, 0)), [50, 51, 0]); // último item sem base não recebe nada
    assert.deepEqual(ratear(0, b(0, 0)), [0, 0]);
    assert.throws(() => ratear(10, b(0, 0)), /Não há base/);
  });

  it("recusas: peso faltando, câmbio zero, item de outro pedido", () => {
    const itens: ItemCusto[] = [{ id: "A", quantidade: 1, precoMoeda: 10, pesoKg: 1 }, { id: "B", quantidade: 1, precoMoeda: 10 }];
    assert.throws(() => calcularCustoImportacao(itens, [d("s", "SEGURO", 5, "PESO")], 5), /peso de todos os itens/);
    assert.throws(() => calcularCustoImportacao(itens, [], 0), /câmbio/);
    assert.throws(() => calcularCustoImportacao(itens, [d("s", "II", 5, "VALOR", { itemId: "Z" })], 5), /não é deste pedido/);
    // peso só é exigido dos itens que participam do rateio
    assert.equal(calcularCustoImportacao(itens, [d("s", "SEGURO", 5, "PESO", { itemId: "A" })], 5).linhas[0].rateioCent, 500);
  });

  it("valor em reais sem erro de ponto flutuante (BigInt) e arredondamento meio-para-cima", () => {
    assert.equal(valorEmReaisCent(1, 0.1, 3), 30); // 0,1 × 3 em float = 0,30000000000000004
    assert.equal(valorEmReaisCent(1, 1.005, 1), 101); // 1,005 → 1,01
    assert.equal(valorEmReaisCent(100000, 99999.9999, 7.123456), 7123455992877); // R$ 71,2 bilhões: o produto intermediário passa de 2^53
  });

  it("recebimentos parciais somam exatamente o total da linha", () => {
    assert.equal(valorAcumuladoCent(36409, 7, 3), 15604); // 364,09 × 3/7 = 156,0386… → 156,04
    assert.equal(valorRecebimentoCent(36409, 7, 3, 4), 20805);
    let soma = 0;
    for (let k = 0; k < 7; k++) soma += valorRecebimentoCent(36409, 7, k, 1);
    assert.equal(soma, 36409);
  });

  it("padrões de integra o custo", () => {
    assert.deepEqual(["II", "FRETE_INTERNACIONAL", "SEGURO", "DESPACHANTE", "ARMAZENAGEM", "AFRMM", "CAPATAZIA", "TRANSPORTE_NACIONAL", "OUTRA"].map((t) => integraCustoPadrao(t as never)), Array(9).fill(true));
    assert.deepEqual(["IPI", "PIS_IMPORTACAO", "COFINS_IMPORTACAO", "ICMS"].map((t) => integraCustoPadrao(t as never)), [false, false, false, false]);
  });
});
