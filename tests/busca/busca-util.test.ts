import test from "node:test";
import assert from "node:assert/strict";
import { criarLimitador, numeroDoDocumento, validarConsulta } from "@/lib/busca-util";

test("validarConsulta: mínimo 2, máximo 60, normaliza espaços", () => {
  assert.equal(validarConsulta(null), null);
  assert.equal(validarConsulta("a"), null);
  assert.equal(validarConsulta("  a "), null);
  assert.equal(validarConsulta("ab"), "ab");
  assert.equal(validarConsulta("  parafuso   tibial "), "parafuso tibial");
  assert.equal(validarConsulta("x".repeat(60))?.length, 60);
  assert.equal(validarConsulta("x".repeat(61)), null);
});

test("numeroDoDocumento: aceita prefixo ou só número, recusa texto e números enormes", () => {
  assert.equal(numeroDoDocumento("PV-12", "PV"), 12);
  assert.equal(numeroDoDocumento("pv12", "PV"), 12);
  assert.equal(numeroDoDocumento("12", "PV"), 12);
  assert.equal(numeroDoDocumento("PC-12", "PV"), null);
  assert.equal(numeroDoDocumento("12345678901", "CIR"), null);
  assert.equal(numeroDoDocumento("abc", "CIR"), null);
});

test("limitador: 30 a cada 10 s por chave, janela deslizante", () => {
  const ok = criarLimitador(30, 10_000);
  for (let i = 0; i < 30; i++) assert.equal(ok("u1", 1000 + i), true);
  assert.equal(ok("u1", 5000), false);
  assert.equal(ok("u2", 5000), true, "outro usuário não é afetado");
  assert.equal(ok("u1", 11_500), true, "libera depois da janela");
});
