/** Limite de consultas simultâneas (painel e busca) e tamanho do pool de conexões. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { emParalelo } from "@/lib/paralelo";
import { tamanhoDoPool } from "@/lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("emParalelo: nunca passa do limite, mantém a ordem e só começa cada tarefa na vez dela", async () => {
  let rodando = 0;
  let pico = 0;
  let iniciadas = 0;
  const tarefa = (i: number) => async () => {
    iniciadas++;
    rodando++;
    pico = Math.max(pico, rodando);
    await sleep(5 + ((i * 7) % 11));
    rodando--;
    return i * 10;
  };
  const tarefas = Array.from({ length: 14 }, (_, i) => tarefa(i));
  assert.equal(iniciadas, 0, "criar a lista não dispara consulta");
  const r = await emParalelo(tarefas, 4);
  assert.equal(pico, 4);
  assert.deepEqual(r, Array.from({ length: 14 }, (_, i) => i * 10));
});

test("emParalelo: tupla tipada, lista vazia e erro propagado", async () => {
  const [a, b] = await emParalelo([async () => 1, async () => "x"] as const, 2);
  assert.equal(a + 1, 2);
  assert.equal(b.toUpperCase(), "X");
  assert.deepEqual(await emParalelo([], 4), []);
  await assert.rejects(emParalelo([async () => 1, async () => { throw new Error("falhou"); }], 1), /falhou/);
});

test("tamanhoDoPool: padrão 20; aceita inteiro de 1 a 200 vindo do ambiente", () => {
  assert.equal(tamanhoDoPool(undefined), 20);
  assert.equal(tamanhoDoPool(""), 20);
  assert.equal(tamanhoDoPool("abc"), 20);
  assert.equal(tamanhoDoPool("0"), 20);
  assert.equal(tamanhoDoPool("2.5"), 20);
  assert.equal(tamanhoDoPool("500"), 20);
  assert.equal(tamanhoDoPool("30"), 30);
});
