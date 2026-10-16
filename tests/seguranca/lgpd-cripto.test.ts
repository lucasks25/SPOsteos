/** Cifra em repouso (src/lib/cripto.ts, docs/LGPD.md §4): ida e volta, adulteração, contexto, rotação, índice cego, chave. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cifrar, decifrar, decifrarParaExibir, ErroCripto, estaCifrado, indiceBusca, indicesBusca, normalizarParaIndice, precisaRecifrar } from "@/lib/cripto";
import { problemaDataKey } from "@/lib/cripto-config";

const K1 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const K2 = "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1";
const CTX = "Cirurgia.carteirinha";

function comChave<T>(valor: string | undefined, fn: () => T): T {
  const env = process.env as Record<string, string | undefined>;
  const antes = { k: env.DATA_KEY, n: env.NODE_ENV };
  try {
    if (valor === undefined) delete env.DATA_KEY;
    else env.DATA_KEY = valor;
    return fn();
  } finally {
    if (antes.k === undefined) delete env.DATA_KEY;
    else env.DATA_KEY = antes.k;
    env.NODE_ENV = antes.n;
  }
}

test("cifra e decifra; IV aleatório (mesmo texto, cifrados diferentes); nada do texto em claro no cifrado", () =>
  comChave(K1, () => {
    const a = cifrar("0123 4567 8901 2345", CTX);
    const b = cifrar("0123 4567 8901 2345", CTX);
    assert.ok(estaCifrado(a) && a.startsWith("enc:v1:"));
    assert.notEqual(a, b);
    assert.ok(!a.includes("0123"));
    assert.equal(decifrar(a, CTX), "0123 4567 8901 2345");
    assert.equal(decifrar(cifrar("", CTX), CTX), "");
    assert.equal(decifrar(cifrar("José Ção 💉", CTX), CTX), "José Ção 💉");
  }));

test("adulteração, contexto trocado e chave errada são recusados (GCM autentica)", () =>
  comChave(K1, () => {
    const c = cifrar("123456789", CTX);
    const partes = c.split(":");
    const corpo = Buffer.from(partes[4], "base64url");
    corpo[0] ^= 1;
    partes[4] = corpo.toString("base64url");
    assert.throws(() => decifrar(partes.join(":"), CTX), ErroCripto);
    assert.throws(() => decifrar(c, "Orcamento.paciente"), ErroCripto, "valor copiado para outra coluna não decifra");
    assert.throws(() => comChave(`v1:${K2}`, () => decifrar(c, CTX)), ErroCripto);
    assert.throws(() => decifrar("enc:v1:lixo", CTX), ErroCripto);
    assert.match(decifrarParaExibir(partes.join(":"), CTX)!, /ilegível/);
  }));

test("legado em claro volta como está e é marcado para recifrar", () =>
  comChave(K1, () => {
    assert.equal(decifrar("774120398801", CTX), "774120398801");
    assert.equal(precisaRecifrar("774120398801"), true);
    assert.equal(precisaRecifrar(cifrar("x", CTX)), false);
    assert.equal(decifrarParaExibir(null, CTX), null);
  }));

test("rotação: v2 cifra, v1 ainda decifra; valor v1 precisa recifrar; sem a v1 o valor antigo não abre", () => {
  const antigo = comChave(K1, () => cifrar("carteirinha-antiga", CTX));
  comChave(`v2:${K2},v1:${K1}`, () => {
    assert.equal(decifrar(antigo, CTX), "carteirinha-antiga");
    assert.equal(precisaRecifrar(antigo), true);
    const novo = cifrar("x", CTX);
    assert.ok(novo.startsWith("enc:v2:"));
    assert.equal(precisaRecifrar(novo), false);
  });
  comChave(`v2:${K2}`, () => assert.throws(() => decifrar(antigo, CTX), /v1 não está na DATA_KEY/));
});

test("índice cego: normaliza, é determinístico, depende do contexto e da chave; busca na rotação devolve as duas versões", () => {
  assert.equal(normalizarParaIndice(" 123.456-7 "), "1234567");
  assert.equal(normalizarParaIndice("José da Silva"), "JOSEDASILVA");
  comChave(K1, () => {
    assert.equal(indiceBusca("123.456-7", CTX), indiceBusca("1234567", CTX));
    assert.notEqual(indiceBusca("1234567", CTX), indiceBusca("1234567", "Outro.campo"));
    assert.equal(indiceBusca("", CTX), null);
    assert.equal(indiceBusca(" - ", CTX), null);
    assert.ok(!indiceBusca("1234567", CTX)!.includes("1234567"));
  });
  const v1 = comChave(K1, () => indiceBusca("1234567", CTX));
  comChave(`v2:${K2},v1:${K1}`, () => {
    const todos = indicesBusca("1234567", CTX);
    assert.equal(todos.length, 2);
    assert.ok(todos.includes(v1!));
    assert.ok(todos[0].startsWith("v2:"));
  });
});

test("sem DATA_KEY: fora de produção grava em claro; em produção recusa cifrar; decifrar cifrado sem chave falha", () => {
  const c = comChave(K1, () => cifrar("abc", CTX));
  comChave(undefined, () => {
    assert.equal(cifrar("abc", CTX), "abc");
    assert.equal(indiceBusca("abc", CTX), null);
    assert.throws(() => decifrar(c, CTX), /DATA_KEY ausente/);
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.throws(() => cifrar("abc", CTX), /DATA_KEY ausente/);
  });
});

test("validação da DATA_KEY: ausente, curta, repetitiva, versões repetidas ou sem versão em lista são recusadas", () => {
  assert.match(problemaDataKey(undefined)!, /ausente/);
  assert.match(problemaDataKey("abc")!, /64 caracteres/);
  assert.match(problemaDataKey("a".repeat(64))!, /variedade/);
  assert.match(problemaDataKey(`${K1},${K2}`)!, /versão de cada uma/);
  assert.match(problemaDataKey(`v1:${K1},v1:${K2}`)!, /repetida/);
  assert.match(problemaDataKey("zz:123")!, /formato/);
  assert.equal(problemaDataKey(K1), null);
  assert.equal(problemaDataKey(`v2:${K2}, v1:${K1}`), null);
  assert.throws(() => comChave("curta", () => cifrar("x", CTX)), ErroCripto);
});
