/** Glosa contra o banco: abate o título sem caixa, vai para Deduções no DRE, respeita saldo e estorno. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { addMeses, hojeUTC, inicioMes } from "@/app/(app)/financeiro/_lib/datas";
import { chaveMes, dreDoMes } from "@/app/(app)/financeiro/_lib/dre";
import { carregarLinhasDre } from "@/app/(app)/financeiro/_lib/dre-dados";
import { estornarGlosa, registrarBaixa, registrarGlosa } from "@/app/(app)/financeiro/_lib/titulos";

const hoje = hojeUTC();
const num = (v: unknown) => Number(String(v ?? 0));
let conta: string, hospitalId: string, centro: string;

async function limpar() {
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.glosa.deleteMany({ where: { contaReceber: { descricao: { startsWith: "TESTEDB" } } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.centroCusto.deleteMany({ where: { codigo: "TESTEDBG" } });
}
before(async () => {
  await limpar();
  hospitalId = (await db.hospital.findFirstOrThrow({ select: { id: true } })).id;
  conta = (await db.contaBancaria.create({ data: { nome: "TESTEDB glosa", saldoInicial: 0 } })).id;
  centro = (await db.centroCusto.create({ data: { codigo: "TESTEDBG", nome: "Teste glosa" } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = async (valor: number) =>
  db.contaReceber.create({ data: { descricao: "TESTEDB receber", valor, vencimento: hoje, competencia: hoje, hospitalId, centroCustoId: centro, planoContaId: (await db.planoConta.findUniqueOrThrow({ where: { codigo: "1.01" } })).id } });
const glosar = (id: string, valor: number, motivo = "item não autorizado") => db.$transaction((tx) => registrarGlosa(tx, { tituloId: id, valor, data: hoje, motivo }));
const baixar = (id: string, valor: number) => db.$transaction((tx) => registrarBaixa(tx, { tipo: "receber", tituloId: id, contaId: conta, data: hoje, valor }));
const ler = (id: string) => db.contaReceber.findUniqueOrThrow({ where: { id } });

test("glosa parcial + recebimento do resto quita; caixa só tem o recebido; estorno reabre", async () => {
  const t = await titulo(1000);
  const g = await glosar(t.id, 300);
  let x = await ler(t.id);
  assert.equal(x.status, "ABERTO");
  assert.equal(num(x.valorBaixado), 300);
  assert.equal(x.valorPago, null); // nenhum dinheiro
  await baixar(t.id, 700);
  x = await ler(t.id);
  assert.equal(x.status, "PAGO");
  assert.equal(num(x.valorPago), 700);
  assert.equal(num(x.valorBaixado), 1000);
  await db.$transaction((tx) => estornarGlosa(tx, g.id));
  assert.equal((await ler(t.id)).status, "ABERTO"); // faltam os 300 glosados
  assert.equal(num((await ler(t.id)).valorBaixado), 700);
});

test("glosa total quita o título sem dinheiro; acima do saldo e sem motivo são recusadas", async () => {
  const t = await titulo(500);
  await assert.rejects(glosar(t.id, 500.01), /maior que o saldo/);
  await assert.rejects(glosar(t.id, 100, "x"), /motivo/);
  await glosar(t.id, 500);
  const x = await ler(t.id);
  assert.equal(x.status, "PAGO");
  assert.equal(x.valorPago, null);
  await assert.rejects(glosar(t.id, 1), /não está em aberto/);
});

test("baixa com desconto não pode passar do saldo depois da glosa", async () => {
  const t = await titulo(1000);
  await glosar(t.id, 400);
  await assert.rejects(baixar(t.id, 700), /maior que o saldo/);
});

test("DRE: glosa vai para Deduções (não para o financeiro) e reduz a receita líquida", async () => {
  await limpar(); // isola dos títulos dos testes anteriores
  centro = (await db.centroCusto.create({ data: { codigo: "TESTEDBG", nome: "Teste glosa" } })).id;
  conta = (await db.contaBancaria.create({ data: { nome: "TESTEDB glosa", saldoInicial: 0 } })).id;
  const t = await titulo(2000);
  await glosar(t.id, 250);
  const linhas = await carregarLinhasDre(inicioMes(hoje), addMeses(inicioMes(hoje), 1), centro);
  const d = dreDoMes(linhas, chaveMes(hoje));
  assert.equal(d.receitaBruta, 2000);
  assert.equal(d.deducoes, -250);
  assert.equal(d.receitaLiquida, 1750);
  assert.equal(d.financeiro, 0);
});
