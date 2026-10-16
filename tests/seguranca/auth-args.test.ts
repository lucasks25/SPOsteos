import { test } from "node:test";
import assert from "node:assert/strict";
import { argBool, argEnum, argId, argIdOuNulo, argInt, argIntOuNulo, ArgumentoInvalido } from "@/lib/auth-args";

const OPERADORES: unknown[] = [{ not: "" }, { gt: 0 }, { in: ["a", "b"] }, ["a"], { equals: "x" }];

test("argId aceita cuid e ids fixos do seed", () => {
  assert.equal(argId("cmg1abc2d0000xyz"), "cmg1abc2d0000xyz");
  assert.equal(argId("local-deposito"), "local-deposito");
});

test("argId recusa objeto-operador do Prisma, vazio, longo e caracteres estranhos", () => {
  for (const v of [...OPERADORES, "", "a".repeat(65), "a b", "a'--", 1, null, undefined, true]) {
    assert.throws(() => argId(v), ArgumentoInvalido, JSON.stringify(v));
  }
});

test("argInt aceita só inteiro positivo do int4 (número, não texto)", () => {
  assert.equal(argInt(1), 1);
  assert.equal(argInt(2147483647), 2147483647);
  for (const v of [...OPERADORES, 0, -1, 1.5, 2147483648, NaN, Infinity, "1", null]) {
    assert.throws(() => argInt(v), ArgumentoInvalido, String(v));
  }
});

test("variantes 'ou nulo', bool e enum", () => {
  assert.equal(argIdOuNulo(null), null);
  assert.equal(argIdOuNulo(undefined), null);
  assert.equal(argIntOuNulo(null), null);
  assert.throws(() => argIdOuNulo({ not: "" }), ArgumentoInvalido);
  assert.equal(argBool(false), false);
  assert.throws(() => argBool("true"), ArgumentoInvalido);
  assert.equal(argEnum("APROVADO", ["APROVADO", "RECUSADO"] as const), "APROVADO");
  assert.throws(() => argEnum({ not: "" }, ["APROVADO"] as const), ArgumentoInvalido);
});

test("a mensagem é de negócio (aparece na tela, sem detalhe interno)", () => {
  try {
    argId({ not: "" });
  } catch (e) {
    assert.equal((e as Error).message, "Parâmetro inválido.");
  }
});
