// Cabeçalho dos impressos (vale, orçamento, boleto, comunicado): dados da empresa de src/lib/empresa.ts.
// Fica em tests/comercial porque o glob do `npm test` não inclui tests/lib (package.json é de outra sessão).
import test from "node:test";
import assert from "node:assert/strict";
import { empresa, linhasEmpresa } from "@/lib/empresa";

const VARS = ["NOME", "RAZAO_SOCIAL", "CNPJ", "ENDERECO", "CEP", "CIDADE", "TELEFONE", "EMAIL"].map((v) => `EMPRESA_${v}`);

function comEnv(valores: Record<string, string | undefined>, fn: () => void) {
  const antes = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  try {
    for (const k of VARS) delete process.env[k];
    for (const [k, v] of Object.entries(valores)) if (v !== undefined) process.env[k] = v;
    fn();
  } finally {
    for (const k of VARS) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
}

test("sem .env: usa os dados públicos do CNPJ da SP OSTEOS e não inventa telefone/e-mail", () => {
  comEnv({}, () => {
    const e = empresa();
    assert.equal(e.nome, "SP OSTEOS");
    assert.equal(e.razaoSocial, "SP OSTEOS Distribuidora de Produtos para a Saúde Ltda");
    assert.equal(e.cnpj, "19.966.249/0001-84");
    assert.equal(e.cep, "09550-250");
    assert.equal(e.cidade, "São Caetano do Sul - SP");
    assert.equal(e.telefone, "");
    assert.equal(e.email, "");
    assert.deepEqual(linhasEmpresa(e), [
      "SP OSTEOS Distribuidora de Produtos para a Saúde Ltda · CNPJ 19.966.249/0001-84",
      "Rua Alegre, 470, sala 1001 - Santa Paula - São Caetano do Sul - SP - CEP 09550-250",
    ]);
  });
});

test("CNPJ padrão tem dígitos verificadores válidos", () => {
  const d = "19966249000184".split("").map(Number);
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  assert.equal(dv(12), d[12]);
  assert.equal(dv(13), d[13]);
});

test(".env sobrescreve o padrão; espaços são ignorados; contatos entram na terceira linha", () => {
  comEnv({ EMPRESA_CNPJ: "  11.222.333/0001-81 ", EMPRESA_TELEFONE: "(11) 2311-0730", EMPRESA_EMAIL: "comercial@sp-osteos.com.br", EMPRESA_CEP: "   " }, () => {
    const e = empresa();
    assert.equal(e.cnpj, "11.222.333/0001-81");
    assert.equal(e.cep, "09550-250"); // só espaços = vazio = padrão
    const l = linhasEmpresa(e);
    assert.equal(l.length, 3);
    assert.equal(l[2], "Tel. (11) 2311-0730 · comercial@sp-osteos.com.br");
  });
});

test("linhasEmpresa omite campos vazios e linhas inteiras vazias", () => {
  const vazia = { nome: "X", razaoSocial: "", cnpj: "", endereco: "", cep: "", cidade: "Santos - SP", telefone: "", email: "" };
  assert.deepEqual(linhasEmpresa(vazia), ["Santos - SP"]);
});
