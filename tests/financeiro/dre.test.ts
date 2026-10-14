import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chaveMes, dreDoMes, dreTotal, efeitosDaBaixa, mesesDe, type LinhaDre, type TipoPlano } from "../../src/app/(app)/financeiro/_lib/dre";
import { erroNovaConta, type PaiPlano } from "../../src/app/(app)/financeiro/_lib/plano-regras";

const M = "2026-10";
const l = (tipo: TipoPlano | null, valor: number, mes = M, planoId: string | null = tipo): LinhaDre => ({ mes, tipo, planoId, valor });
const baixa = (tipo: "receber" | "pagar", juros: number, multa: number, desconto: number) => efeitosDaBaixa({ tipo, juros, multa, desconto });
const TIPO_CHAVE = { JUROS_RECEBIDOS: "RECEITA_FINANCEIRA", DESCONTO_OBTIDO: "RECEITA_FINANCEIRA", JUROS_PAGOS: "DESPESA_FINANCEIRA", DESCONTO_CONCEDIDO: "DESPESA_FINANCEIRA" } as const;
const doBaixa = (efs: ReturnType<typeof efeitosDaBaixa>) => efs.map((e) => l(TIPO_CHAVE[e.chave], e.valor));

describe("DRE gerencial", () => {
  it("exemplo completo de out/26 (conferido à mão)", () => {
    const linhas: LinhaDre[] = [
      l("RECEITA", 100000), // NF PV-10 (40.000 recebidos não mudam nada)
      l("CUSTO", -55000), // CMV congelado no faturamento
      l("DEDUCAO", -9250), // impostos sobre a venda (vencem em nov, competência out)
      // compra de mercadoria 60.000 → ESTOQUE (NAO_RESULTADO) fora do DRE
      l("NAO_RESULTADO", -60000),
      l("DESPESA", -8000), // aluguel
      l("DESPESA", -5000), // comissão
      ...doBaixa(baixa("receber", 150, 50, 0)), // CR 1.000 recebida com 1.200
      ...doBaixa(baixa("pagar", 0, 0, 300)), // CP 3.000 paga com 2.700 + 300 de desconto
      ...doBaixa(baixa("receber", 0, 0, 500)), // CR 10.000 recebida com 9.500 + 500 de desconto
      l("DESPESA_FINANCEIRA", -120), // juros pagos avulsos
      l("DESPESA_FINANCEIRA", -45), // tarifa avulsa
    ];
    const d = dreDoMes(linhas, M);
    assert.equal(d.receitaBruta, 100000);
    assert.equal(d.receitaLiquida, 90750);
    assert.equal(d.lucroBruto, 35750);
    assert.ok(Math.abs(d.margemBruta! - 0.3939) < 0.0001);
    assert.equal(d.despesas, -13000);
    assert.equal(d.resultadoOperacional, 22750);
    assert.equal(d.financeiro, -165); // (200 + 300) − (500 + 120 + 45)
    assert.equal(d.resultadoAntesIr, 22585);
    assert.equal(d.resultadoLiquido, 22585);
  });

  it("sinais das baixas: juros/multa e desconto, receber e pagar", () => {
    assert.deepEqual(baixa("receber", 150, 50, 0), [{ chave: "JUROS_RECEBIDOS", valor: 200 }]);
    assert.deepEqual(baixa("receber", 0, 0, 500), [{ chave: "DESCONTO_CONCEDIDO", valor: -500 }]);
    assert.deepEqual(baixa("pagar", 10, 5, 0), [{ chave: "JUROS_PAGOS", valor: -15 }]);
    assert.deepEqual(baixa("pagar", 0, 0, 300), [{ chave: "DESCONTO_OBTIDO", valor: 300 }]);
    assert.deepEqual(baixa("pagar", 0, 0, 0), []);
  });

  it("pagar com desconto: despesa fica cheia na competência e o efeito líquido iguala o caixa", () => {
    // CP 3.000 (despesa −3.000) paga com 2.700 + 300 de desconto (+300 financeiro) → −2.700 = caixa
    const d = dreDoMes([l("DESPESA", -3000), ...doBaixa(baixa("pagar", 0, 0, 300))], M);
    assert.equal(d.despesas, -3000);
    assert.equal(d.financeiro, 300);
    assert.equal(d.resultadoLiquido, -2700);
  });

  it("reembolso recebido numa conta de despesa reduz a despesa", () => {
    const d = dreDoMes([l("DESPESA", -1000), l("DESPESA", 200)], M);
    assert.equal(d.despesas, -800);
  });

  it("NAO_RESULTADO fica fora do resultado", () => {
    const d = dreDoMes([l("NAO_RESULTADO", -60000), l("NAO_RESULTADO", 25000)], M);
    assert.equal(d.resultadoLiquido, 0);
  });

  it("não classificado soma no resultado e aparece à parte", () => {
    const d = dreDoMes([l("RECEITA", 1000), l(null, -300, M, null)], M);
    assert.equal(d.naoClassificado, -300);
    assert.equal(d.resultadoOperacional, 1000);
    assert.equal(d.resultadoLiquido, 700);
  });

  it("só considera o mês pedido; Total soma os meses", () => {
    const linhas = [l("RECEITA", 100, "2026-09"), l("RECEITA", 200, "2026-10"), l("DESPESA", -50, "2026-11")];
    assert.equal(dreDoMes(linhas, "2026-10").receitaBruta, 200);
    const t = dreTotal(linhas, ["2026-09", "2026-10"]);
    assert.equal(t.receitaBruta, 300);
    assert.equal(t.despesas, 0);
  });

  it("margem nula sem receita; IR entra depois do resultado antes do IR", () => {
    assert.equal(dreDoMes([l("DESPESA", -10)], M).margemBruta, null);
    const d = dreDoMes([l("RECEITA", 1000), l("IMPOSTO_LUCRO", -100)], M);
    assert.equal(d.resultadoAntesIr, 1000);
    assert.equal(d.resultadoLiquido, 900);
  });

  it("drill-down: valor por conta do plano", () => {
    const d = dreDoMes([l("DESPESA", -8000, M, "aluguel"), l("DESPESA", -5000, M, "comissao"), l("DESPESA", -500, M, "aluguel")], M);
    const por = Object.fromEntries(d.contas.DESPESA!.map((c) => [c.planoId, c.valor]));
    assert.deepEqual(por, { aluguel: -8500, comissao: -5000 });
  });

  it("arredonda centavos sem dízima", () => {
    const d = dreDoMes([l("RECEITA", 0.1), l("RECEITA", 0.2)], M);
    assert.equal(d.receitaBruta, 0.3);
  });

  it("chaveMes e mesesDe", () => {
    assert.equal(chaveMes(new Date("2026-10-31T00:00:00Z")), "2026-10");
    assert.deepEqual(mesesDe("2026-11", 3), ["2026-11", "2026-12", "2027-01"]);
  });
});

describe("plano de contas: regras da árvore", () => {
  const grupo: PaiPlano = { tipo: "DESPESA", analitica: false, ativo: true, codigo: "4", nome: "Despesas operacionais" };
  it("aceita filha com mesmo tipo e código dentro do grupo", () => {
    assert.equal(erroNovaConta({ codigo: "4.08", tipo: "DESPESA" }, grupo), null);
    assert.equal(erroNovaConta({ codigo: "9", tipo: "CUSTO" }, null), null);
  });
  it("recusa tipo diferente do pai, pai analítico, pai inativo e código fora do grupo", () => {
    assert.match(erroNovaConta({ codigo: "4.08", tipo: "CUSTO" }, grupo)!, /mesmo tipo/);
    assert.match(erroNovaConta({ codigo: "4.08", tipo: "DESPESA" }, { ...grupo, analitica: true })!, /analítica/);
    assert.match(erroNovaConta({ codigo: "4.08", tipo: "DESPESA" }, { ...grupo, ativo: false })!, /inativo/);
    assert.match(erroNovaConta({ codigo: "5.01", tipo: "DESPESA" }, grupo)!, /começar com 4\./);
  });
  it("recusa código mal formado", () => {
    for (const c of ["", "a.1", "4..1", "4.", ".4", "4 1"]) assert.match(erroNovaConta({ codigo: c, tipo: "DESPESA" }, null)!, /inválido/);
  });
});
