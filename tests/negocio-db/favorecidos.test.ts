/** Dados de pagamento do fornecedor: só FINANCEIRO/ADMIN gravam, auditoria mascarada, cadastro não toca nas colunas. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { gravarDadosPagamento } from "@/app/(app)/financeiro/_lib/favorecidos-servico";
import { schemaDadosPagamento } from "@/app/(app)/financeiro/_lib/favorecidos";
import { limparTudo, mkFornecedor, P, uid } from "./_util";
import { apagarAuditoriaTeste } from "./_auditoria";

before(limparTudo);
after(async () => {
  await apagarAuditoriaTeste({ entidade: "Fornecedor", detalhes: { startsWith: P } });
  await limparTudo();
  await db.$disconnect();
});

const dados = { bancoCodigo: "341", agencia: "1234", conta: "98765432", contaDigito: "1", chavePix: "pagamentos@fornecedor-teste.com" };
const usuario = async (perfil: "FINANCEIRO" | "ADMIN") => {
  const u = await db.usuario.findFirst({ where: { ativo: true }, select: { id: true } });
  assert.ok(u, "precisa de ao menos um usuário no banco (seed)");
  return { id: u.id, perfil };
};

test("perfil sem acesso não grava nada", async () => {
  const f = await mkFornecedor();
  const u = await usuario("FINANCEIRO");
  for (const perfil of ["COMPRAS", "ESTOQUE", "COMERCIAL", "QUALIDADE"] as const) {
    await assert.rejects(gravarDadosPagamento({ id: u.id, perfil }, f.id, dados), /Acesso negado/, perfil);
  }
  const depois = await db.fornecedor.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(depois.conta, null);
  assert.equal(depois.chavePix, null);
});

test("financeiro grava, a auditoria leva antes/depois mascarados e fornecedor inexistente é recusado", async () => {
  const f = await mkFornecedor();
  const u = await usuario("FINANCEIRO");
  await gravarDadosPagamento(u, f.id, dados);
  const salvo = await db.fornecedor.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(salvo.conta, "98765432");
  await gravarDadosPagamento(u, f.id, { ...dados, conta: "11112222" });
  const logs = await db.logAuditoria.findMany({ where: { entidade: "Fornecedor", entidadeId: f.id }, orderBy: { id: "asc" } });
  assert.equal(logs.length, 2);
  const texto = logs.map((l) => l.detalhes).join("\n");
  assert.match(logs[1].detalhes ?? "", /conta …5432 → …2222/);
  assert.ok(!texto.includes("98765432") && !texto.includes("11112222") && !texto.includes("fornecedor-teste.com") && !texto.includes("pagamentos@"));
  await assert.rejects(gravarDadosPagamento(await usuario("ADMIN"), `nao-existe-${uid()}`, dados), /não encontrado/);
});

test("formato inválido é recusado antes de gravar", async () => {
  const f = await mkFornecedor();
  for (const ruim of [{ ...dados, bancoCodigo: "34" }, { ...dados, chavePix: "não é pix" }, { ...dados, conta: "12.3" }]) {
    assert.equal(schemaDadosPagamento.safeParse(ruim).success, false);
  }
  assert.equal((await db.fornecedor.findUniqueOrThrow({ where: { id: f.id } })).conta, null);
});
