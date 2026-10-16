import assert from "node:assert/strict";
import { test } from "node:test";
import { descreverMudancas, mascarar, podeVerDadosPagamento, schemaDadosPagamento, situacaoPagamento } from "@/app/(app)/financeiro/_lib/favorecidos";

const vazio = { bancoCodigo: null, agencia: null, conta: null, contaDigito: null, chavePix: null };

test("só FINANCEIRO e ADMIN veem dados de pagamento", () => {
  for (const p of ["FINANCEIRO", "ADMIN"] as const) assert.equal(podeVerDadosPagamento(p), true);
  for (const p of ["COMPRAS", "ESTOQUE", "COMERCIAL", "QUALIDADE"] as const) assert.equal(podeVerDadosPagamento(p), false, p);
});

test("situação: sem dados, só Pix, só conta, completo", () => {
  assert.equal(situacaoPagamento(vazio), "SEM_DADOS");
  assert.equal(situacaoPagamento({ ...vazio, chavePix: "a@b.com" }), "SO_PIX");
  const conta = { ...vazio, bancoCodigo: "341", agencia: "1234", conta: "56789", contaDigito: "0" };
  assert.equal(situacaoPagamento(conta), "SO_CONTA");
  assert.equal(situacaoPagamento({ ...conta, chavePix: "a@b.com" }), "COMPLETO");
  assert.equal(situacaoPagamento({ ...conta, contaDigito: null }), "SEM_DADOS", "conta incompleta não conta");
});

test("máscara e descrição das mudanças não vazam o valor completo", () => {
  assert.equal(mascarar("12345678"), "…5678");
  assert.equal(mascarar(null), "vazio");
  const d = descreverMudancas({ ...vazio, conta: "11112222" }, { ...vazio, conta: "99998888", chavePix: "fornecedor@empresa.com" });
  assert.match(d, /conta …2222 → …8888/);
  assert.match(d, /chavePix vazio → …\.com/);
  assert.ok(!d.includes("99998888") && !d.includes("fornecedor@empresa"));
  assert.equal(descreverMudancas(vazio, vazio), "");
});

test("validação de formato", () => {
  const ok = schemaDadosPagamento.safeParse({ bancoCodigo: "341", agencia: "1234", conta: "56789", contaDigito: "x", chavePix: "+5511987654321" });
  assert.ok(ok.success && ok.data.contaDigito === "X");
  assert.ok(schemaDadosPagamento.safeParse({}).success, "tudo vazio é permitido (limpa)");
  for (const ruim of [{ bancoCodigo: "34" }, { bancoCodigo: "341", agencia: "12a", conta: "1", contaDigito: "0" }, { chavePix: "lixo" }, { agencia: "1234" }]) {
    assert.equal(schemaDadosPagamento.safeParse(ruim).success, false, JSON.stringify(ruim));
  }
});

test("conta digitada com hífen separa o dígito; com dígito já informado continua inválida", () => {
  const base = { bancoCodigo: "341", agencia: "1234" };
  const ok = schemaDadosPagamento.safeParse({ ...base, conta: "22222-3" });
  assert.ok(ok.success && ok.data.conta === "22222" && ok.data.contaDigito === "3");
  const x = schemaDadosPagamento.safeParse({ ...base, conta: "22222-x" });
  assert.ok(x.success && x.data.contaDigito === "X");
  assert.equal(schemaDadosPagamento.safeParse({ ...base, conta: "22222-3", contaDigito: "4" }).success, false);
});
