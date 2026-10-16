import { test } from "node:test";
import assert from "node:assert/strict";
import { problemaAuthSecret } from "@/lib/auth-config";
import { register } from "@/instrumentation";

test("AUTH_SECRET: ausente, curto, de exemplo ou repetitivo é recusado; aleatório de 64 hex passa", () => {
  assert.match(problemaAuthSecret(undefined)!, /ausente/);
  assert.match(problemaAuthSecret("")!, /ausente/);
  assert.match(problemaAuthSecret("a1b2c3")!, /curto/);
  assert.match(problemaAuthSecret("troque-por-um-valor-aleatorio-de-32-caracteres")!, /exemplo/);
  assert.match(problemaAuthSecret("a".repeat(40))!, /variedade/);
  assert.equal(problemaAuthSecret("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"), null);
});

test("produção sem AUTH_SECRET forte: o servidor não sobe (register lança)", () => {
  const env = process.env as Record<string, string | undefined>;
  const antes = { s: env.AUTH_SECRET, n: env.NODE_ENV, r: env.NEXT_RUNTIME, k: env.DATA_KEY, d: env.ALLOW_INSECURE_DB };
  try {
    // as outras checagens da subida (DATA_KEY, banco sem TLS) passam: o teste isola a do AUTH_SECRET
    env.DATA_KEY = "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1";
    env.ALLOW_INSECURE_DB = "1";
    env.NEXT_RUNTIME = "nodejs";
    env.NODE_ENV = "production";
    env.AUTH_SECRET = "curto";
    assert.throws(() => register(), /AUTH_SECRET curto/);
    delete env.AUTH_SECRET;
    assert.throws(() => register(), /AUTH_SECRET ausente/);
    env.AUTH_SECRET = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    assert.doesNotThrow(() => register());
    env.NEXT_RUNTIME = "edge";
    env.AUTH_SECRET = "curto";
    assert.doesNotThrow(() => register(), "no runtime edge não valida (não há segredo lá)");
  } finally {
    env.AUTH_SECRET = antes.s;
    env.NODE_ENV = antes.n;
    env.NEXT_RUNTIME = antes.r;
    env.DATA_KEY = antes.k;
    env.ALLOW_INSECURE_DB = antes.d;
    for (const k of ["DATA_KEY", "ALLOW_INSECURE_DB", "AUTH_SECRET", "NEXT_RUNTIME"] as const) if (env[k] === undefined) delete env[k];
  }
});
