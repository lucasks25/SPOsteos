/**
 * Sessão (src/lib/auth-token.ts, src/lib/auth-cookie.ts): o JWT só vale com HS256 e a nossa chave (alg "none", outro
 * algoritmo, assinatura de outra chave e token vencido são recusados), o token da 2ª etapa do login não vale como
 * sessão (nem o contrário), o cookie leva __Host- em produção, e o 2º fator é obrigatório para ADMIN e FINANCEIRO.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { verifyToken } from "@/lib/auth-token";
import { mfaObrigatoria } from "@/lib/auth-config";
import { nomeCookieMfa, nomeCookieSessao } from "@/lib/auth-cookie";

const SEGREDO = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
process.env.AUTH_SECRET = SEGREDO;
const chave = (s = SEGREDO) => new TextEncoder().encode(s);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const daqui = (s: number) => Math.floor(Date.now() / 1000) + s;

test("token válido (HS256, nossa chave) é aceito com id e versão", async () => {
  const t = await new SignJWT({ sub: "u1", v: 3 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(60)).sign(chave());
  assert.deepEqual(await verifyToken(t), { id: "u1", versao: 3 });
});

test('alg "none" (token sem assinatura) é recusado', async () => {
  const semAssinatura = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "admin", v: 0, exp: daqui(60) })}.`;
  assert.equal(await verifyToken(semAssinatura), null);
});

test("outro algoritmo (HS512 com a mesma chave), outra chave e token vencido são recusados", async () => {
  const hs512 = await new SignJWT({ sub: "u1", v: 0 }).setProtectedHeader({ alg: "HS512" }).setExpirationTime(daqui(60)).sign(chave(SEGREDO + SEGREDO));
  assert.equal(await verifyToken(hs512), null);
  const outra = await new SignJWT({ sub: "u1", v: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(60)).sign(chave("3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1"));
  assert.equal(await verifyToken(outra), null);
  const vencido = await new SignJWT({ sub: "u1", v: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(-10)).sign(chave());
  assert.equal(await verifyToken(vencido), null);
  const adulterado = (await new SignJWT({ sub: "u1", v: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(60)).sign(chave())).split(".");
  assert.equal(await verifyToken([adulterado[0], b64({ sub: "admin", v: 0, exp: daqui(60) }), adulterado[2]].join(".")), null);
});

test("token da 2ª etapa (senha conferida, falta o código) não abre sessão, e o de sessão não pula o código", async () => {
  const mfa = await new SignJWT({ sub: "u1", v: 0, f: "mfa" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(60)).sign(chave());
  const sessao = await new SignJWT({ sub: "u1", v: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(daqui(60)).sign(chave());
  assert.equal(await verifyToken(mfa), null);
  assert.deepEqual(await verifyToken(mfa, "mfa"), { id: "u1", versao: 0 });
  assert.equal(await verifyToken(sessao, "mfa"), null);
});

test("cookie com prefixo __Host- só em produção (exige Secure; em http de desenvolvimento não funcionaria)", () => {
  const env = process.env as Record<string, string | undefined>;
  const antes = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal(nomeCookieSessao(), "__Host-opme_session");
    assert.equal(nomeCookieMfa(), "__Host-opme_mfa");
    env.NODE_ENV = "development";
    assert.equal(nomeCookieSessao(), "opme_session");
  } finally {
    env.NODE_ENV = antes;
  }
});

test("2º fator obrigatório: ADMIN e FINANCEIRO em produção; os outros perfis não; MFA_OBRIGATORIA liga/desliga", () => {
  const prod = { NODE_ENV: "production" };
  assert.equal(mfaObrigatoria("ADMIN", prod), true);
  assert.equal(mfaObrigatoria("FINANCEIRO", prod), true);
  for (const p of ["COMERCIAL", "ESTOQUE", "QUALIDADE", "COMPRAS"]) assert.equal(mfaObrigatoria(p, prod), false, p);
  assert.equal(mfaObrigatoria("ADMIN", { NODE_ENV: "development" }), false);
  assert.equal(mfaObrigatoria("ADMIN", { NODE_ENV: "development", MFA_OBRIGATORIA: "1" }), true);
  assert.equal(mfaObrigatoria("ADMIN", { NODE_ENV: "production", MFA_OBRIGATORIA: "0" }), false);
});
