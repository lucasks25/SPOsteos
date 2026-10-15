/** Classificação em lote: tudo ou nada, não sobrescreve, respeita conta analítica e mês fechado. Limpa o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
import { classificarEmLote, lerItens } from "@/app/(app)/financeiro/_lib/classificar";

const hoje = hojeUTC();
const OUTUBRO = new Date("2025-11-12T00:00:00Z");
let conta: string, hospitalId: string, fornecedorId: string, despesa: string, grupo: string;
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

async function limpar() {
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.fechamentoMes.deleteMany({ where: { mes: "2025-11" } });
}
before(async () => {
  await limpar();
  hospitalId = (await db.hospital.findFirstOrThrow({ select: { id: true } })).id;
  fornecedorId = (await db.fornecedor.findFirstOrThrow({ select: { id: true } })).id;
  conta = (await db.contaBancaria.create({ data: { nome: "TESTEDB c", saldoInicial: 0 } })).id;
  despesa = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4.02" } })).id;
  grupo = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4" } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const cr = (dia = hoje) => db.contaReceber.create({ data: { descricao: "TESTEDB cr", valor: 10, vencimento: dia, competencia: dia, hospitalId } });
const cp = (dia = hoje) => db.contaPagar.create({ data: { descricao: "TESTEDB cp", valor: 20, vencimento: dia, competencia: dia, fornecedorId } });
const av = (dia = hoje) => db.lancamento.create({ data: { contaId: conta, data: dia, sentido: "SAIDA", valor: 5, descricao: "TESTEDB avulso" } });

test("lerItens aceita só o formato tipo:id e remove repetidos", () => {
  assert.deepEqual(lerItens(["receber:a1", "pagar:b-2", "receber:a1", "x:1", "avulso:", "avulso:c3"]), [
    { tipo: "receber", id: "a1" },
    { tipo: "pagar", id: "b-2" },
    { tipo: "avulso", id: "c3" },
  ]);
});

test("classifica título a receber, a pagar e avulso de uma vez", async () => {
  const [a, b, c] = [await cr(), await cp(), await av()];
  const n = await tx((x) => classificarEmLote(x, [{ tipo: "receber", id: a.id }, { tipo: "pagar", id: b.id }, { tipo: "avulso", id: c.id }], despesa, null));
  assert.equal(n, 3);
  assert.equal((await db.contaReceber.findUniqueOrThrow({ where: { id: a.id } })).planoContaId, despesa);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: b.id } })).planoContaId, despesa);
  assert.equal((await db.lancamento.findUniqueOrThrow({ where: { id: c.id } })).planoContaId, despesa);
});

test("não sobrescreve item já classificado e conta de grupo é recusada; nada é gravado pela metade", async () => {
  const novo = await cp();
  const feito = await cp();
  await db.contaPagar.update({ where: { id: feito.id }, data: { planoContaId: despesa } });
  await assert.rejects(tx((x) => classificarEmLote(x, [{ tipo: "pagar", id: novo.id }, { tipo: "pagar", id: feito.id }], despesa, null)), /já foi classificado/);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: novo.id } })).planoContaId, null);
  await assert.rejects(tx((x) => classificarEmLote(x, [{ tipo: "pagar", id: novo.id }], grupo, null)), /é um grupo/);
});

test("não classifica baixa de título como avulso; mês fechado recusa o lote inteiro", async () => {
  const t = await cr();
  const baixa = await db.lancamento.create({ data: { contaId: conta, data: hoje, sentido: "ENTRADA", valor: 10, principal: 10, descricao: "TESTEDB baixa", contaReceberId: t.id } });
  await assert.rejects(tx((x) => classificarEmLote(x, [{ tipo: "avulso", id: baixa.id }], despesa, null)), /avulsos/);
  const velho = await cp(OUTUBRO);
  const atual = await cp();
  await db.fechamentoMes.create({ data: { mes: "2025-11" } });
  await assert.rejects(tx((x) => classificarEmLote(x, [{ tipo: "pagar", id: velho.id }, { tipo: "pagar", id: atual.id }], despesa, null)), /fechado/);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: atual.id } })).planoContaId, null);
});
