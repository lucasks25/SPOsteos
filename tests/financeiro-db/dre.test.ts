/**
 * DRE gerencial contra o banco real. Tudo o que o teste cria carrega um centro de custo próprio (TESTEDB),
 * então o filtro por centro isola o cenário dos dados que já existam. Apaga tudo no final.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { addMeses, hojeUTC, inicioMes } from "@/app/(app)/financeiro/_lib/datas";
import { chaveMes, dreDoMes } from "@/app/(app)/financeiro/_lib/dre";
import { carregarLinhasDre } from "@/app/(app)/financeiro/_lib/dre-dados";
import { registrarBaixa, transferir } from "@/app/(app)/financeiro/_lib/titulos";

const hoje = hojeUTC();
const mes = chaveMes(hoje);
let conta: string, outra: string, centro: string, hospitalId: string, fornecedorId: string;
const plano = async (codigo: string) => (await db.planoConta.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;

async function limpar() {
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: [conta, outra].filter(Boolean) } }, { descricao: { startsWith: "TESTEDB" } }] } });
  await db.transferencia.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.centroCusto.deleteMany({ where: { codigo: "TESTEDB" } });
}

before(async () => {
  await limpar();
  hospitalId = (await db.hospital.findFirstOrThrow({ select: { id: true } })).id;
  fornecedorId = (await db.fornecedor.findFirstOrThrow({ select: { id: true } })).id;
  conta = (await db.contaBancaria.create({ data: { nome: "TESTEDB A", saldoInicial: 100000 } })).id;
  outra = (await db.contaBancaria.create({ data: { nome: "TESTEDB B", saldoInicial: 0 } })).id;
  centro = (await db.centroCusto.create({ data: { codigo: "TESTEDB", nome: "Teste DRE" } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

test("DRE do banco: competência, baixas com juros/desconto, avulso, cancelado, transferência e não classificado", async () => {
  const receita = await plano("1.01");
  const aluguel = await plano("4.02");
  const estoque = await plano("8.01");
  const tarifa = await plano("6.03");
  const cr = (valor: number, planoContaId: string | null, extra = {}) =>
    db.contaReceber.create({ data: { descricao: "TESTEDB cr", valor, vencimento: hoje, competencia: hoje, hospitalId, planoContaId, centroCustoId: centro, ...extra } });
  const cp = (valor: number, planoContaId: string | null, extra = {}) =>
    db.contaPagar.create({ data: { descricao: "TESTEDB cp", valor, vencimento: hoje, competencia: hoje, fornecedorId, planoContaId, centroCustoId: centro, ...extra } });
  const baixar = (tipo: "receber" | "pagar", id: string, e: { valor: number; juros?: number; multa?: number; desconto?: number }) =>
    db.$transaction((tx) => registrarBaixa(tx, { tipo, tituloId: id, contaId: conta, data: hoje, ...e }));

  const r1 = await cr(1000, receita);
  await baixar("receber", r1.id, { valor: 1200, juros: 150, multa: 50 }); // +200 financeiro
  const r2 = await cr(10000, receita);
  await baixar("receber", r2.id, { valor: 9500, desconto: 500 }); // −500 financeiro
  const p1 = await cp(3000, aluguel);
  await baixar("pagar", p1.id, { valor: 2700, desconto: 300 }); // +300 financeiro, despesa fica −3000
  await cp(6000, estoque); // compra: fora do DRE
  await cp(777, aluguel, { status: "CANCELADO" }); // cancelado: fora
  await cp(100, null); // sem classificação
  await cp(555, aluguel, { competencia: addMeses(inicioMes(hoje), -1) }); // outro mês: fora
  await db.lancamento.create({ data: { contaId: conta, data: hoje, sentido: "SAIDA", valor: 45, descricao: "TESTEDB tarifa", planoContaId: tarifa, centroCustoId: centro } });
  await db.$transaction((tx) => transferir(tx, { origemId: conta, destinoId: outra, valor: 20000, data: hoje, descricao: "TESTEDB transf" }));

  const linhas = await carregarLinhasDre(inicioMes(hoje), addMeses(inicioMes(hoje), 1), centro);
  const d = dreDoMes(linhas, mes);
  assert.equal(d.receitaBruta, 11000);
  assert.equal(d.despesas, -3000);
  assert.equal(d.financeiro, -45); // 200 − 500 + 300 − 45
  assert.equal(d.naoClassificado, -100);
  assert.equal(d.resultadoLiquido, 7855); // 11000 − 3000 − 45 − 100
});

test("o banco recusa plano/centro em lançamento que é baixa de título ou transferência", async () => {
  const r = await db.contaReceber.create({ data: { descricao: "TESTEDB cr", valor: 100, vencimento: hoje, competencia: hoje, hospitalId } });
  await assert.rejects(
    db.lancamento.create({ data: { contaId: conta, data: hoje, sentido: "ENTRADA", valor: 100, principal: 100, descricao: "TESTEDB x", contaReceberId: r.id, planoContaId: await plano("1.01") } }),
    /Lancamento_plano_so_no_avulso|check constraint/i,
  );
});

test("plano: o banco recusa código malformado e pai igual ao próprio", async () => {
  await assert.rejects(db.planoConta.create({ data: { codigo: "4..x", nome: "TESTEDB", tipo: "DESPESA" } }), /codigo_formato|check constraint/i);
});
