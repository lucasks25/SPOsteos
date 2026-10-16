/** Mascaramento do paciente em listas (src/lib/privacidade.ts, docs/LGPD.md §3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mascararCarteirinha, mascararNome } from "@/lib/privacidade";

test("nome: primeiro nome + inicial do último sobrenome; ignora partículas e sufixos", () => {
  assert.equal(mascararNome("Maria da Silva Santos"), "Maria S.");
  assert.equal(mascararNome("  maria   souza "), "maria S.");
  assert.equal(mascararNome("Pedro Souza Filho"), "Pedro S.");
  assert.equal(mascararNome("José dos Santos Júnior"), "José S.");
  assert.equal(mascararNome("Ana de"), "Ana");
  assert.equal(mascararNome("Ana"), "Ana");
  assert.equal(mascararNome("Élio Ávila"), "Élio Á.");
  assert.equal(mascararNome(""), "");
  assert.equal(mascararNome(null), "");
});

test("nome mascarado nunca contém o sobrenome inteiro", () => {
  for (const n of ["Carlos Eduardo Pereira", "Beatriz Oliveira", "João Pedro de Almeida Prado"]) {
    const m = mascararNome(n);
    const sobrenome = n.split(" ").pop()!;
    assert.ok(!m.includes(sobrenome), `${m} expõe ${sobrenome}`);
  }
});

test("carteirinha: só os 4 últimos; curta vira só máscara", () => {
  assert.equal(mascararCarteirinha("0123 4567 8901 2345"), "•••• 2345");
  assert.equal(mascararCarteirinha("774120398801"), "•••• 8801");
  assert.equal(mascararCarteirinha("123"), "••••");
  assert.equal(mascararCarteirinha("1234"), "••••");
  assert.equal(mascararCarteirinha(null), "");
  assert.equal(mascararCarteirinha(" - "), "");
});
