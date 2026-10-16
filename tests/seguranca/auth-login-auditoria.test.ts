/**
 * Login falho não grava na auditoria texto que não seja e-mail (quem digita a senha no campo de e-mail deixava a senha
 * no log: docs/REVISAO.md §19.1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emailParaAuditoria } from "@/lib/auth-login";

test("e-mail válido vai em minúsculas e sem espaços nas pontas", () => {
  assert.equal(emailParaAuditoria("  Fulano.Silva@SPOsteos.com.BR "), "fulano.silva@sposteos.com.br");
});

test("senha digitada no campo de e-mail não vai para a auditoria", () => {
  for (const t of ["MinhaSenha@2026", "s3nh@forte", "senha secreta@x.com", "abc", "", "@dominio.com", "nome@semponto"]) {
    assert.equal(emailParaAuditoria(t), "(não é um e-mail)", `gravaria "${t}"`);
  }
});

test("texto com formato de e-mail acima de 254 caracteres não vai inteiro", () => {
  const longo = `${"a".repeat(250)}@x.com`;
  assert.equal(emailParaAuditoria(longo), "(não é um e-mail)");
  const limite = `${"a".repeat(248)}@x.com`; // 254
  assert.equal(emailParaAuditoria(limite), limite);
});
