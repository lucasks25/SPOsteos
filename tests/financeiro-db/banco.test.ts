/**
 * Testes de integração do financeiro: usam o banco do DATABASE_URL.
 * Rode com `npm run test:db` apontando para um banco de desenvolvimento/teste, nunca produção.
 * Cada teste cria seus próprios registros (prefixo TESTEDB) e apaga tudo no final.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { addDias, hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
import { painelFinanceiro } from "@/app/(app)/financeiro/_lib/painel";
import { calcularFluxo } from "@/app/(app)/financeiro/_lib/fluxo";
import { estornarBaixa, estornarTransferencia, registrarBaixa, transferir } from "@/app/(app)/financeiro/_lib/titulos";

const hoje = hojeUTC();
const num = (v: unknown) => Number(String(v ?? 0));
let contaA: string, contaB: string, hospitalId: string, fornecedorId: string;

const titulo = (tipo: "receber" | "pagar", valor: number, venc = 10) =>
  tipo === "receber"
    ? db.contaReceber.create({ data: { descricao: "TESTEDB receber", valor, vencimento: addDias(hoje, venc), competencia: hoje, hospitalId } })
    : db.contaPagar.create({ data: { descricao: "TESTEDB pagar", valor, vencimento: addDias(hoje, venc), competencia: hoje, fornecedorId } });
const lerTitulo = (tipo: "receber" | "pagar", id: string) => (tipo === "receber" ? db.contaReceber.findUniqueOrThrow({ where: { id } }) : db.contaPagar.findUniqueOrThrow({ where: { id } }));
const baixar = (tipo: "receber" | "pagar", id: string, extra: { valor: number; juros?: number; multa?: number; desconto?: number }) =>
  db.$transaction((tx) => registrarBaixa(tx, { tipo, tituloId: id, contaId: contaA, data: hoje, ...extra }));

async function limpar() {
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: [contaA, contaB].filter(Boolean) } }, { descricao: { startsWith: "TESTEDB" } }] } });
  await db.transferencia.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
}

before(async () => {
  hospitalId = (await db.hospital.findFirstOrThrow({ select: { id: true } })).id;
  fornecedorId = (await db.fornecedor.findFirstOrThrow({ select: { id: true } })).id;
  contaA = (await db.contaBancaria.create({ data: { nome: "TESTEDB A", saldoInicial: 5000 } })).id;
  contaB = (await db.contaBancaria.create({ data: { nome: "TESTEDB B", saldoInicial: 0 } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

test("pagar 1050 com juros 30 + multa 20: título PAGO, valorPago 1050, valorBaixado 1000; estorno reabre", async () => {
  const t = await titulo("pagar", 1000);
  const l = await baixar("pagar", t.id, { valor: 1050, juros: 30, multa: 20 });
  let x = await lerTitulo("pagar", t.id);
  assert.equal(x.status, "PAGO");
  assert.equal(num(x.valorPago), 1050);
  assert.equal(num(x.valorBaixado), 1000);
  assert.equal(num(l.principal), 1000);
  await db.$transaction((tx) => estornarBaixa(tx, "pagar", l.id));
  x = await lerTitulo("pagar", t.id);
  assert.equal(x.status, "ABERTO");
  assert.equal(x.valorPago, null);
  assert.equal(x.valorBaixado, null);
});

test("desconto: paga 980 com 20 de desconto quita; parcial 600 depois 380+20 quita; estorno do último volta a 400", async () => {
  const d = await titulo("receber", 1000);
  await baixar("receber", d.id, { valor: 980, desconto: 20 });
  assert.equal((await lerTitulo("receber", d.id)).status, "PAGO");

  const p = await titulo("receber", 1000);
  await baixar("receber", p.id, { valor: 600 });
  let x = await lerTitulo("receber", p.id);
  assert.equal(x.status, "ABERTO");
  assert.equal(num(x.valorBaixado), 600);
  const l2 = await baixar("receber", p.id, { valor: 380, desconto: 20 });
  x = await lerTitulo("receber", p.id);
  assert.equal(x.status, "PAGO");
  assert.equal(num(x.valorPago), 980);
  await db.$transaction((tx) => estornarBaixa(tx, "receber", l2.id));
  x = await lerTitulo("receber", p.id);
  assert.equal(x.status, "ABERTO");
  assert.equal(num(x.valorBaixado), 600);
});

test("acima do saldo sem juros é recusado e nada é gravado", async () => {
  const t = await titulo("pagar", 1000);
  await assert.rejects(baixar("pagar", t.id, { valor: 1050 }), /juros ou a multa/);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: t.id } }), 0);
});

test("o banco recusa lançamento inconsistente (CHECK)", async () => {
  const t = await titulo("pagar", 100);
  const base = { contaId: contaA, data: hoje, sentido: "SAIDA" as const, valor: 100, descricao: "TESTEDB check" };
  await assert.rejects(db.lancamento.create({ data: { ...base, contaPagarId: t.id, principal: 90 } }), "valor ≠ principal + juros + multa − desconto");
  await assert.rejects(db.lancamento.create({ data: { ...base, principal: 100 } }), "principal em lançamento avulso");
  await assert.rejects(db.lancamento.create({ data: { ...base, contaPagarId: t.id } }), "baixa de título sem principal");
  await assert.rejects(db.lancamento.create({ data: { ...base, juros: -5 } }), "juros negativo");
});

test("duas baixas simultâneas de 600 num título de 1000: só uma passa (trava de linha)", async () => {
  const t = await titulo("pagar", 1000);
  const r = await Promise.allSettled([baixar("pagar", t.id, { valor: 600 }), baixar("pagar", t.id, { valor: 600 })]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(r.filter((x) => x.status === "rejected").length, 1);
  assert.equal(num((await lerTitulo("pagar", t.id)).valorBaixado), 600);
});

test("transferência: saldos das contas mudam, painel e fluxo não; estorno remove as duas pernas", async () => {
  const saldo = async (id: string) => {
    const c = await db.contaBancaria.findUniqueOrThrow({ where: { id } });
    const s = await db.lancamento.groupBy({ by: ["sentido"], where: { contaId: id }, _sum: { valor: true } });
    return num(c.saldoInicial) + num(s.find((x) => x.sentido === "ENTRADA")?._sum.valor) - num(s.find((x) => x.sentido === "SAIDA")?._sum.valor);
  };
  const antesA = await saldo(contaA), antesB = await saldo(contaB);
  const antesPainel = await painelFinanceiro(hoje);
  const antesFluxo = await calcularFluxo(hoje, addDias(hoje, 30), "semana", hoje);

  const t = await db.$transaction((tx) => transferir(tx, { origemId: contaA, destinoId: contaB, valor: 500, data: hoje, descricao: "TESTEDB transf" }));

  const aposA = await saldo(contaA), aposB = await saldo(contaB);
  const depoisPainel = await painelFinanceiro(hoje);
  const depoisFluxo = await calcularFluxo(hoje, addDias(hoje, 30), "semana", hoje);
  assert.equal(aposA, antesA - 500, "origem perde 500");
  assert.equal(aposB, antesB + 500, "destino ganha 500");
  assert.equal(aposA + aposB, antesA + antesB, "soma das contas não muda");
  assert.equal(depoisPainel.mes.entradas, antesPainel.mes.entradas, "transferência não é entrada do mês");
  assert.equal(depoisPainel.mes.saidas, antesPainel.mes.saidas, "transferência não é saída do mês");
  assert.equal(depoisPainel.saldoTotal, antesPainel.saldoTotal, "saldo total igual");
  assert.deepEqual(depoisFluxo.faixas.map((f) => [f.recReal, f.pagReal]), antesFluxo.faixas.map((f) => [f.recReal, f.pagReal]), "realizado do fluxo igual");
  assert.equal(depoisFluxo.saldoInicial, antesFluxo.saldoInicial);

  await db.$transaction((tx) => estornarTransferencia(tx, t.id));
  assert.equal(await db.lancamento.count({ where: { transferenciaId: t.id } }), 0);
  assert.equal(await db.transferencia.count({ where: { id: t.id } }), 0);
  assert.equal(await saldo(contaA), antesA, "estorno devolve o saldo da origem");
  assert.equal(await saldo(contaB), antesB, "estorno devolve o saldo do destino");
});

test("transferência: mesma conta, conta inativa e perna conciliada são recusadas", async () => {
  await assert.rejects(db.$transaction((tx) => transferir(tx, { origemId: contaA, destinoId: contaA, valor: 1, data: hoje, descricao: "TESTEDB x" })), /diferentes/);
  const inativa = await db.contaBancaria.create({ data: { nome: "TESTEDB inativa", ativo: false } });
  await assert.rejects(db.$transaction((tx) => transferir(tx, { origemId: contaA, destinoId: inativa.id, valor: 1, data: hoje, descricao: "TESTEDB x" })), /inativa/);
  const t = await db.$transaction((tx) => transferir(tx, { origemId: contaA, destinoId: contaB, valor: 10, data: hoje, descricao: "TESTEDB conc" }));
  const perna = await db.lancamento.findFirstOrThrow({ where: { transferenciaId: t.id, sentido: "SAIDA" } });
  const linha = await db.extratoLinha.create({ data: { contaId: contaA, data: hoje, valor: -10, descricao: "TESTEDB extrato", fitid: `TESTEDB-${Date.now()}`, lancamentoId: perna.id } });
  await assert.rejects(db.$transaction((tx) => estornarTransferencia(tx, t.id)), /conciliada/);
  await db.extratoLinha.delete({ where: { id: linha.id } });
  await db.$transaction((tx) => estornarTransferencia(tx, t.id));
});
