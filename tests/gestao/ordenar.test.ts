import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hrefOrdem, ordenar, parseOrdem, proximaOrdem } from "../../src/app/(app)/gestao/_lib/ordem";

type L = { nome: string; v: number | null };
const acc = { nome: (l: L) => l.nome, v: (l: L) => l.v };
const dados: L[] = [{ nome: "b", v: 2 }, { nome: "Á", v: null }, { nome: "c", v: 2 }, { nome: "a", v: 10 }];

describe("ordenar", () => {
  it("parseOrdem aceita só colunas permitidas; '-' é decrescente", () => {
    const pad = { campo: "v", dir: "desc" as const };
    assert.deepEqual(parseOrdem("nome", ["nome", "v"], pad), { campo: "nome", dir: "asc" });
    assert.deepEqual(parseOrdem("-nome", ["nome", "v"], pad), { campo: "nome", dir: "desc" });
    assert.deepEqual(parseOrdem("hack", ["nome", "v"], pad), pad);
    assert.deepEqual(parseOrdem(undefined, ["nome"], pad), pad);
    assert.deepEqual(parseOrdem(["nome"], ["nome"], pad), pad);
  });
  it("proximaOrdem inverte a coluna ativa; coluna nova: número decrescente, texto crescente", () => {
    assert.deepEqual(proximaOrdem({ campo: "v", dir: "desc" }, "v", true), { campo: "v", dir: "asc" });
    assert.deepEqual(proximaOrdem({ campo: "v", dir: "asc" }, "v", true), { campo: "v", dir: "desc" });
    assert.deepEqual(proximaOrdem({ campo: "v", dir: "asc" }, "nome", false), { campo: "nome", dir: "asc" });
    assert.deepEqual(proximaOrdem({ campo: "nome", dir: "asc" }, "v", true), { campo: "v", dir: "desc" });
  });
  it("numérico estável, nulos sempre no fim, sem mutar a entrada", () => {
    const copia = [...dados];
    assert.deepEqual(ordenar(dados, { campo: "v", dir: "asc" }, acc).map((l) => l.nome), ["b", "c", "a", "Á"]);
    assert.deepEqual(ordenar(dados, { campo: "v", dir: "desc" }, acc).map((l) => l.nome), ["a", "b", "c", "Á"]);
    assert.deepEqual(dados, copia);
  });
  it("texto em ordem do português, sem diferenciar acento/caixa (Á e a empatam e ficam na ordem original)", () => {
    assert.deepEqual(ordenar(dados, { campo: "nome", dir: "asc" }, acc).map((l) => l.nome), ["Á", "a", "b", "c"]);
    assert.deepEqual(ordenar(dados, { campo: "nome", dir: "desc" }, acc).map((l) => l.nome), ["c", "b", "Á", "a"]);
  });
  it("coluna desconhecida mantém a ordem", () => {
    assert.deepEqual(ordenar(dados, { campo: "x", dir: "asc" }, acc), dados);
  });
  it("hrefOrdem preserva os outros parâmetros e troca o da ordenação", () => {
    assert.equal(hrefOrdem("/gestao/margem", { de: "2026-01-01", op: "nome", vazio: "", lista: ["a", "b"] }, "op", { campo: "margem", dir: "desc" }), "/gestao/margem?de=2026-01-01&op=-margem");
  });
});
