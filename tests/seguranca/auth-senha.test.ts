/** Política única de senha (src/lib/auth-senha.ts): criar, redefinir pelo admin e trocar a própria. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { problemaSenha, SENHA_MIN } from "@/lib/auth-senha";

const ctx = { email: "maria.souza@sposteos.com.br", nome: "Maria Aparecida Souza" };

test("aceita frase longa e senha aleatória", () => {
  for (const s of ["cavalo correto bateria grampo", "T7#qm2!Lx9pZ", "minha bicicleta azul de 1998", "pão de queijo às sete"]) assert.equal(problemaSenha(s, ctx), null, s);
});

test(`menos de ${SENHA_MIN} caracteres é recusada (o admin aceitava 8)`, () => {
  assert.match(problemaSenha("Ab1!xyz9", ctx)!, /pelo menos 10/);
});

test("passa de 72 bytes é recusada mesmo com até 72 caracteres (o bcrypt ignoraria o resto em silêncio)", () => {
  assert.equal(problemaSenha("ã".repeat(36) + "z", {}), "A senha passou do limite de 72 bytes (letras acentuadas contam 2). Use uma mais curta.");
  assert.equal(problemaSenha("Kq8#vR2m!Lp5@wZ9".repeat(4) + "Tn4$bX7&", {}), null, "72 bytes ASCII ainda serve");
});

test("senha comum, palavra óbvia com números/símbolos, repetitiva ou sequencial é recusada", () => {
  for (const s of ["1234567890", "qwertyuiop", "Senha@2026!", "SENHA123456", "Opme12345678", "SpOsteos2026", "administrador", "aaaaaaaaaaaa", "abababababab", "abcdefghijk", "9876543210", "Brasil2026"]) {
    assert.ok(problemaSenha(s, {}), `aceitaria "${s}"`);
  }
});

test("senha com o e-mail ou o nome da pessoa é recusada (sem diferença de maiúscula ou acento)", () => {
  for (const s of ["maria.souza@sposteos.com.br", "MariaSouza#77", "x-SOUZA-2026-y", "aparecida!!9", "Ápárecida2026x"]) assert.match(problemaSenha(s, ctx)!, /nome|e-mail/, s);
  assert.equal(problemaSenha("Ana#trem#azul9", ctx), null, "parte com menos de 4 letras (ana) não conta");
});
