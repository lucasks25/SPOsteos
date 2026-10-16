/** Documentos e licenças: situação por validade (dia de Brasília), filtros equivalentes, alvo/escopo e renovação. Funções puras. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { diaBrasilia } from "@/app/(app)/financeiro/_lib/datas";
import {
  COR_SITUACAO, diasParaVencer, erroDoAlvo, filtroValidade, FILTRO_ATENCAO, mesmoAlvo, piorSituacao, podeEditarDocumentos, podeVerDocumentos,
  SITUACOES, situacaoDocumento, textoSituacao,
} from "@/app/(app)/qualidade/_lib/documentos";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const hoje = D("2026-10-15");
const mais = (n: number) => new Date(hoje.getTime() + n * 86400000);

test("situação: limites exatos de 30 e 90 dias e o dia da validade", () => {
  assert.equal(situacaoDocumento(null, hoje), "SEM_VENCIMENTO");
  assert.equal(situacaoDocumento(mais(-1), hoje), "VENCIDO");
  assert.equal(situacaoDocumento(mais(0), hoje), "VENCE_EM_30", "no último dia ainda vale");
  assert.equal(situacaoDocumento(mais(30), hoje), "VENCE_EM_30");
  assert.equal(situacaoDocumento(mais(31), hoje), "VENCE_EM_90");
  assert.equal(situacaoDocumento(mais(90), hoje), "VENCE_EM_90");
  assert.equal(situacaoDocumento(mais(91), hoje), "VIGENTE");
  assert.equal(situacaoDocumento(mais(3650), hoje), "VIGENTE");
});

test("situação usa o dia de Brasília (virada às 03:00 UTC)", () => {
  // 15/10 às 23:30 em Brasília = 16/10 02:30 UTC; o dia de Brasília continua 15/10
  assert.equal(diaBrasilia(new Date("2026-10-16T02:30:00Z")).toISOString().slice(0, 10), "2026-10-15");
  assert.equal(situacaoDocumento(D("2026-10-15"), diaBrasilia(new Date("2026-10-16T02:30:00Z"))), "VENCE_EM_30", "vence hoje, não vencido");
  // 16/10 às 00:30 em Brasília = 16/10 03:30 UTC; agora o documento de 15/10 venceu
  assert.equal(situacaoDocumento(D("2026-10-15"), diaBrasilia(new Date("2026-10-16T03:30:00Z"))), "VENCIDO");
});

test("diasParaVencer e textos do selo", () => {
  assert.equal(diasParaVencer(mais(12), hoje), 12);
  assert.equal(textoSituacao(mais(-3), hoje), "Vencido há 3 d");
  assert.equal(textoSituacao(mais(0), hoje), "Vence hoje");
  assert.equal(textoSituacao(mais(12), hoje), "Vence em 12 d");
  assert.equal(textoSituacao(mais(200), hoje), "Vigente");
  assert.equal(textoSituacao(null, hoje), "Sem vencimento");
  for (const s of SITUACOES) assert.ok(COR_SITUACAO[s]);
});

test("filtroValidade é equivalente a situacaoDocumento para qualquer data", () => {
  const casa = (v: Date | null, w: ReturnType<typeof filtroValidade>) => {
    const c = w.validade as null | { lt?: Date; lte?: Date; gt?: Date; gte?: Date };
    if (c === null) return v === null;
    if (v === null) return false;
    return (c.lt === undefined || v < c.lt) && (c.lte === undefined || v <= c.lte) && (c.gt === undefined || v > c.gt) && (c.gte === undefined || v >= c.gte);
  };
  for (let n = -5; n <= 130; n++) {
    const v = mais(n);
    const sit = situacaoDocumento(v, hoje);
    for (const s of SITUACOES) assert.equal(casa(v, filtroValidade(s, hoje)), s === sit, `dia ${n} filtro ${s}`);
    assert.equal(casa(v, filtroValidade(FILTRO_ATENCAO, hoje)), sit === "VENCIDO" || sit === "VENCE_EM_30", `atenção dia ${n}`);
  }
  assert.equal(casa(null, filtroValidade("SEM_VENCIMENTO", hoje)), true);
  assert.equal(casa(null, filtroValidade(FILTRO_ATENCAO, hoje)), false, "sem vencimento não gera alerta");
});

test("pior situação de um conjunto", () => {
  assert.equal(piorSituacao([], hoje), null);
  assert.equal(piorSituacao([null, mais(400)], hoje), "VIGENTE");
  assert.equal(piorSituacao([mais(400), mais(20), mais(60)], hoje), "VENCE_EM_30");
  assert.equal(piorSituacao([mais(400), mais(-1), mais(20)], hoje), "VENCIDO");
});

test("escopo e vínculo: exatamente a FK do escopo", () => {
  assert.equal(erroDoAlvo({ escopo: "EMPRESA" }), null);
  assert.ok(erroDoAlvo({ escopo: "EMPRESA", fornecedorId: "x" }));
  assert.equal(erroDoAlvo({ escopo: "FORNECEDOR", fornecedorId: "x" }), null);
  assert.ok(erroDoAlvo({ escopo: "FORNECEDOR" }));
  assert.ok(erroDoAlvo({ escopo: "FORNECEDOR", fornecedorId: "x", produtoId: "y" }));
  assert.ok(erroDoAlvo({ escopo: "FABRICANTE", fornecedorId: "x" }));
  assert.equal(erroDoAlvo({ escopo: "PRODUTO", produtoId: "p" }), null);
});

test("renovação só entre documentos do mesmo tipo, escopo e vínculo", () => {
  const a = { tipo: "AFE", escopo: "FORNECEDOR" as const, fornecedorId: "f1" };
  assert.ok(mesmoAlvo(a, { ...a }));
  assert.ok(!mesmoAlvo(a, { ...a, tipo: "LAUDO" }));
  assert.ok(!mesmoAlvo(a, { ...a, fornecedorId: "f2" }));
  assert.ok(!mesmoAlvo(a, { tipo: "AFE", escopo: "EMPRESA" }));
});

test("perfis: quem consulta e quem edita", () => {
  for (const p of ["QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL", "ADMIN"] as const) assert.ok(podeVerDocumentos(p), p);
  assert.ok(!podeVerDocumentos("FINANCEIRO"));
  assert.ok(podeEditarDocumentos("QUALIDADE") && podeEditarDocumentos("ADMIN"));
  for (const p of ["ESTOQUE", "COMPRAS", "COMERCIAL", "FINANCEIRO"] as const) assert.ok(!podeEditarDocumentos(p), p);
});
