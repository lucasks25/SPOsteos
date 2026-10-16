import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusEfetivo, verificarRiscoGlosa, type AutorizacaoEntrada } from "../../src/app/(app)/comercial/_lib/autorizacao";

// 20/10/2026 10:00 em Brasília
const CIRURGIA = new Date("2026-10-20T13:00:00Z");
const guia = (status: AutorizacaoEntrada["status"], itens: [string, number][], validade: string | null = null): AutorizacaoEntrada => ({
  status,
  validade: validade ? new Date(`${validade}T00:00:00Z`) : null,
  itens: itens.map(([produtoId, quantidadeAutorizada]) => ({ produtoId, quantidadeAutorizada })),
});
const consumo = (produtoId: string, quantidade: number) => ({ produtoId, descricao: `Produto ${produtoId}`, quantidade });
const verificar = (autorizacoes: AutorizacaoEntrada[], consumos: ReturnType<typeof consumo>[], aplicavel = true) => verificarRiscoGlosa({ aplicavel, dataCirurgia: CIRURGIA, autorizacoes, consumos, nomes: { C: "Produto C" } });
const codigos = (r: ReturnType<typeof verificar>) => r.achados.map((a) => `${a.codigo}:${a.produtoId ?? ""}:${a.severidade}`);

describe("risco de glosa por autorização", () => {
  it("convênio que não exige autorização (ou sem convênio) não gera achado", () => {
    const r = verificar([], [consumo("A", 3)], false);
    assert.deepEqual(r, { aplicavel: false, achados: [], grave: false });
  });

  it("sem guia: grave se já houve consumo, atenção se a cirurgia ainda vai acontecer", () => {
    assert.deepEqual(codigos(verificar([], [consumo("A", 1)])), ["SEM_AUTORIZACAO::grave"]);
    const antes = verificar([], []);
    assert.deepEqual(codigos(antes), ["SEM_AUTORIZACAO::atencao"]);
    assert.equal(antes.grave, false);
  });

  it("cirurgia faturada ou cancelada não emite o achado de falta de autorização", () => {
    const r = (statusCirurgia: string) => verificarRiscoGlosa({ aplicavel: true, dataCirurgia: CIRURGIA, autorizacoes: [], consumos: [consumo("A", 1)], statusCirurgia });
    assert.deepEqual(r("FATURADA").achados, []);
    assert.deepEqual(r("CANCELADA").achados, []);
    assert.deepEqual(codigos(r("REALIZADA")), ["SEM_AUTORIZACAO::grave"]);
  });

  it("negada, expirada e pendente sem nenhuma guia válida", () => {
    assert.deepEqual(codigos(verificar([guia("NEGADA", [])], [consumo("A", 1)])), ["AUTORIZACAO_NEGADA::grave"]);
    assert.deepEqual(codigos(verificar([guia("EXPIRADA", [["A", 1]])], [consumo("A", 1)])), ["AUTORIZACAO_EXPIRADA::grave"]);
    assert.deepEqual(codigos(verificar([guia("SOLICITADA", [])], [consumo("A", 1)])), ["AUTORIZACAO_PENDENTE::grave"]);
    assert.deepEqual(codigos(verificar([guia("NEGADA", []), guia("SOLICITADA", [])], [consumo("A", 1)])), ["AUTORIZACAO_NEGADA::grave", "AUTORIZACAO_PENDENTE::grave"]);
  });

  it("validade: vale até o fim do dia da cirurgia em Brasília; um dia antes expira", () => {
    assert.equal(statusEfetivo(guia("AUTORIZADA", [], "2026-10-20"), CIRURGIA), "AUTORIZADA");
    assert.equal(statusEfetivo(guia("AUTORIZADA", [], "2026-10-19"), CIRURGIA), "EXPIRADA");
    // 23:00 de 19/10 em Brasília (02:00Z de 20/10) ainda é dia 19: validade 19/10 vale, 18/10 não
    const noite = new Date("2026-10-20T02:00:00Z");
    assert.equal(statusEfetivo(guia("PARCIAL", [], "2026-10-19"), noite), "PARCIAL");
    assert.equal(statusEfetivo(guia("PARCIAL", [], "2026-10-18"), noite), "EXPIRADA");
    assert.equal(statusEfetivo(guia("SOLICITADA", [], "2026-01-01"), CIRURGIA), "SOLICITADA");
    assert.deepEqual(codigos(verificar([guia("AUTORIZADA", [["A", 5]], "2026-10-19")], [consumo("A", 1)])), ["AUTORIZACAO_EXPIRADA::grave"]);
  });

  it("não autorizado, quantidade acima e autorizado não usado; graves primeiro", () => {
    // consumido A=3 B=2; autorizado A=2 e C=5
    const r = verificar([guia("PARCIAL", [["A", 2], ["C", 5]])], [consumo("A", 3), consumo("B", 2)]);
    assert.deepEqual(codigos(r), ["NAO_AUTORIZADO:B:grave", "QUANTIDADE_EXCEDIDA:A:grave", "AUTORIZADO_NAO_UTILIZADO:C:info"]);
    assert.equal(r.grave, true);
    const exc = r.achados.find((a) => a.codigo === "QUANTIDADE_EXCEDIDA")!;
    assert.deepEqual([exc.consumido, exc.autorizado], [3, 2]);
    assert.match(exc.detalhe, /excesso de 1/);
    assert.match(r.achados[2].titulo, /Produto C/);
  });

  it("consumo de vários lotes do mesmo produto soma; várias guias válidas somam o autorizado", () => {
    const r = verificar([guia("AUTORIZADA", [["A", 2]]), guia("AUTORIZADA", [["A", 1]]), guia("NEGADA", [["A", 99]])], [consumo("A", 1), consumo("A", 2)]);
    assert.deepEqual(r.achados, []);
    assert.equal(r.grave, false);
    // um lote a mais estoura
    assert.deepEqual(codigos(verificar([guia("AUTORIZADA", [["A", 2]]), guia("AUTORIZADA", [["A", 1]])], [consumo("A", 1), consumo("A", 2), consumo("A", 1)])), ["QUANTIDADE_EXCEDIDA:A:grave"]);
  });

  it("guia válida e cirurgia sem consumo: sem achados (nada a comparar ainda); item autorizado com quantidade zero conta como não autorizado", () => {
    assert.deepEqual(verificar([guia("AUTORIZADA", [["A", 2]])], []).achados, []);
    assert.deepEqual(codigos(verificar([guia("PARCIAL", [["A", 0], ["B", 1]])], [consumo("A", 1), consumo("B", 1)])), ["NAO_AUTORIZADO:A:grave"]);
  });
});
