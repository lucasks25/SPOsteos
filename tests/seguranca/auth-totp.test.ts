/**
 * 2º fator TOTP (src/lib/auth-totp.ts) contra os vetores oficiais: RFC 6238 apêndice B (SHA-1) e RFC 4648 §10 (base32).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32, conferirTotp, deBase32, hotp, normalizarRecuperacao, novosCodigosRecuperacao, pareceRecuperacao, PASSO_S, resumoRecuperacao, uriOtpauth,
} from "@/lib/auth-totp";

const SEG = Buffer.from("12345678901234567890"); // semente SHA-1 da RFC 6238

test("RFC 6238 apêndice B: os 6 vetores SHA-1 (8 dígitos)", () => {
  const vetores: [number, string][] = [
    [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
  ];
  for (const [t, esperado] of vetores) assert.equal(hotp(SEG, Math.floor(t / PASSO_S), 8), esperado, `T=${t}`);
});

test("RFC 4648 §10: base32 ida e volta", () => {
  const casos: [string, string][] = [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]];
  for (const [txt, b32] of casos) {
    assert.equal(base32(Buffer.from(txt)), b32);
    assert.equal(deBase32(b32).toString(), txt);
  }
  assert.equal(deBase32("mzxw 6ytb-oi").toString(), "foobar", "aceita minúsculas, espaços e hífens");
  assert.throws(() => deBase32("MZ1"), /base32/);
});

test("conferirTotp: aceita o passo atual e ±1, recusa ±2, texto que não é 6 dígitos e devolve o passo (anti-replay)", () => {
  const agora = 1234567890 * 1000;
  const passo = Math.floor(1234567890 / PASSO_S);
  assert.equal(conferirTotp(SEG, hotp(SEG, passo), agora), passo);
  assert.equal(conferirTotp(SEG, hotp(SEG, passo - 1), agora), passo - 1);
  assert.equal(conferirTotp(SEG, hotp(SEG, passo + 1), agora), passo + 1);
  assert.equal(conferirTotp(SEG, hotp(SEG, passo - 2), agora), null);
  assert.equal(conferirTotp(SEG, hotp(SEG, passo + 2), agora), null);
  assert.equal(conferirTotp(SEG, ` ${hotp(SEG, passo).slice(0, 3)} ${hotp(SEG, passo).slice(3)} `, agora), passo, "espaços são ignorados");
  for (const ruim of ["", "12345", "1234567", "abcdef", "12345a"]) assert.equal(conferirTotp(SEG, ruim, agora), null, ruim);
  assert.equal(conferirTotp(Buffer.from("outra-semente-qualquer"), hotp(SEG, passo), agora), null);
});

test("códigos de recuperação: 10, únicos, formato XXXXX-XXXXX, resumo com chave (não é sha256 puro)", () => {
  const c = novosCodigosRecuperacao();
  assert.equal(c.length, 10);
  assert.equal(new Set(c).size, 10);
  for (const x of c) {
    assert.match(x, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    assert.ok(pareceRecuperacao(x) && pareceRecuperacao(x.toLowerCase().replace("-", " ")));
  }
  assert.equal(pareceRecuperacao("123456"), false, "6 dígitos é código do aplicativo");
  const k1 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const k2 = "3c9909afec25354d551dae21590bb26e38d53f2173b8d3dc3eee4c047e7ab1c1";
  assert.equal(resumoRecuperacao(c[0], k1), resumoRecuperacao(normalizarRecuperacao(c[0]).toLowerCase(), k1));
  assert.notEqual(resumoRecuperacao(c[0], k1), resumoRecuperacao(c[0], k2), "outra chave do servidor, outro resumo");
});

test("uri otpauth com emissor, conta e parâmetros que os aplicativos esperam", () => {
  const u = uriOtpauth(SEG, "fulano@sposteos.com.br");
  assert.match(u, /^otpauth:\/\/totp\/SP%20OSTEOS%20OPME%3Afulano%40sposteos\.com\.br\?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=SP%20OSTEOS%20OPME&algorithm=SHA1&digits=6&period=30$/);
});
