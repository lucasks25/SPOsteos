/**
 * Serviços do financeiro que estavam inline nas actions (sem login): aprovação em lote, salvar/cancelar/classificar título,
 * lançamento avulso, ativar/inativar conta, fechamento de mês e plano de contas. Dados com prefixo TESTEDB.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { aprovarContasPagarTx } from "@/app/(app)/financeiro/_lib/aprovacao-servico";
import { gerarRemessaDaContaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { alternarAtivoContaTx, excluirLancamentoAvulsoTx, lancarAvulsoTx } from "@/app/(app)/financeiro/_lib/contas-servico";
import { fecharMesTx, reabrirMesTx } from "@/app/(app)/financeiro/_lib/fechamento-servico";
import { alternarCentroCustoTx, alternarContaPlanoTx, criarCentroCustoTx, criarContaPlanoTx } from "@/app/(app)/financeiro/_lib/plano-servico";
import { cancelarTituloTx, classificarTituloTx, salvarContaPagarTx, salvarContaReceberTx } from "@/app/(app)/financeiro/_lib/titulos-servico";
import { registrarBaixa } from "@/app/(app)/financeiro/_lib/titulos";
import { dia, limparTudo, mkFornecedor, mkHospital, num, P } from "./_util";

const MES_FECHADO = "2024-08";
const DIA_FECHADO = new Date("2024-08-10T00:00:00Z");
const MES_VAZIO = "2019-01"; // sem nenhum lançamento: fecha e reabre sem depender dos dados do banco
let mesJaFechado = false;
let vazioJaFechado = false;
let contaA: string, planoOk: string, grupo: string, hospitalId: string, fornecedorId: string;

async function limpar() {
  const contas = await db.contaBancaria.findMany({ where: { nome: { startsWith: P } }, select: { id: true } });
  await db.lancamento.deleteMany({ where: { contaId: { in: contas.map((c) => c.id) } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: P } } });
  await db.planoConta.deleteMany({ where: { nome: { startsWith: P }, paiId: { not: null } } });
  await db.planoConta.deleteMany({ where: { nome: { startsWith: P } } });
  await db.centroCusto.deleteMany({ where: { nome: { startsWith: P } } });
  await limparTudo();
}

before(async () => {
  await limpar();
  mesJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_FECHADO } }));
  vazioJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_VAZIO } }));
  contaA = (await db.contaBancaria.create({ data: { nome: `${P} serv A`, tipo: "BANCO", saldoInicial: 0 } })).id;
  planoOk = (await db.planoConta.create({ data: { codigo: "96.01", nome: `${P} despesa`, tipo: "DESPESA", analitica: true } })).id;
  grupo = (await db.planoConta.create({ data: { codigo: "96", nome: `${P} grupo`, tipo: "DESPESA", analitica: false } })).id;
  hospitalId = (await mkHospital()).id;
  fornecedorId = (await mkFornecedor()).id;
});
after(async () => {
  if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  if (!vazioJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_VAZIO } });
  await limpar();
  await db.$disconnect();
});

const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
const pagarPendente = (valor = 100, competencia = dia(0)) =>
  db.contaPagar.create({ data: { descricao: `${P} pagar`, valor, vencimento: dia(10), competencia, fornecedorId } });
async function comMesFechado<T>(f: () => Promise<T>) {
  if (!mesJaFechado) await db.fechamentoMes.create({ data: { mes: MES_FECHADO } });
  try {
    return await f();
  } finally {
    if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  }
}

test("aprovação em lote: aprova as pendentes, ignora já aprovadas/pagas e recusa quando nada sobra", async () => {
  const a = await pagarPendente(), b = await pagarPendente();
  const jaAprovada = await db.contaPagar.create({ data: { descricao: `${P} ja`, valor: 10, vencimento: dia(1), competencia: dia(0), fornecedorId, aprovadoEm: new Date(Date.now() - 86400000) } });
  const cancelada = await db.contaPagar.create({ data: { descricao: `${P} canc`, valor: 10, vencimento: dia(1), competencia: dia(0), fornecedorId, status: "CANCELADO" } });
  const n = await tx((x) => aprovarContasPagarTx(x, [a.id, b.id, jaAprovada.id, cancelada.id], "usuario-teste"));
  assert.equal(n, 2);
  const lida = await db.contaPagar.findUniqueOrThrow({ where: { id: a.id } });
  assert.ok(lida.aprovadoEm);
  assert.equal(lida.aprovadoPor, "usuario-teste");
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: jaAprovada.id } })).aprovadoPor, null); // não sobrescreve
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: cancelada.id } })).aprovadoEm, null);
  await assert.rejects(tx((x) => aprovarContasPagarTx(x, [a.id, b.id], "u")), /Nada a aprovar/);
  await assert.rejects(tx((x) => aprovarContasPagarTx(x, [], "u")), /Selecione ao menos uma conta/);
  await assert.rejects(tx((x) => aprovarContasPagarTx(x, Array.from({ length: 501 }, (_, i) => `id${i}`), "u")), /Máximo de 500/);
});

test("aprovação em lote com uma conta de mês fechado recusa o lote inteiro", async () => {
  const ok = await pagarPendente();
  const fechada = await pagarPendente(100, DIA_FECHADO);
  await comMesFechado(async () => {
    await assert.rejects(tx((x) => aprovarContasPagarTx(x, [ok.id, fechada.id], "u")), /está fechado/);
  });
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: ok.id } })).aprovadoEm, null);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: fechada.id } })).aprovadoEm, null);
});

test("salvar conta a receber: cria, edita em aberto, recusa com baixa, grupo do plano e mês fechado", async () => {
  const d = { descricao: `${P} receber`, hospitalId, planoContaId: planoOk, centroCustoId: null, competencia: dia(0), valor: 200, vencimento: dia(5) };
  const id = await tx((x) => salvarContaReceberTx(x, null, d));
  await tx((x) => salvarContaReceberTx(x, id, { ...d, valor: 250 }));
  assert.equal(num((await db.contaReceber.findUniqueOrThrow({ where: { id } })).valor), 250);
  await assert.rejects(tx((x) => salvarContaReceberTx(x, null, { ...d, planoContaId: grupo })), /é um grupo/);
  await comMesFechado(async () => {
    await assert.rejects(tx((x) => salvarContaReceberTx(x, null, { ...d, competencia: DIA_FECHADO })), /está fechado/);
    await assert.rejects(tx((x) => salvarContaReceberTx(x, id, { ...d, competencia: DIA_FECHADO })), /está fechado/);
  });
  await tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: id, contaId: contaA, data: dia(0), valor: 50, juros: 0, multa: 0, desconto: 0 }));
  await assert.rejects(tx((x) => salvarContaReceberTx(x, id, { ...d, valor: 300 })), /em aberto e sem baixas/);
  assert.equal(num((await db.contaReceber.findUniqueOrThrow({ where: { id } })).valor), 250);
});

test("salvar conta a pagar: criada à mão nasce aprovada por quem criou; editar não mexe na aprovação", async () => {
  const d = { descricao: `${P} pagar manual`, fornecedorId, planoContaId: planoOk, centroCustoId: null, competencia: dia(0), codigoBarras: null, valor: 80, vencimento: dia(5) };
  const id = await tx((x) => salvarContaPagarTx(x, null, d, "usuario-teste"));
  const criada = await db.contaPagar.findUniqueOrThrow({ where: { id } });
  assert.ok(criada.aprovadoEm);
  assert.equal(criada.aprovadoPor, "usuario-teste");
  await tx((x) => salvarContaPagarTx(x, id, { ...d, valor: 90 }, "outro"));
  const editada = await db.contaPagar.findUniqueOrThrow({ where: { id } });
  assert.equal(num(editada.valor), 90);
  assert.equal(editada.aprovadoPor, "usuario-teste");
});

test("cancelar título: só em aberto e sem baixas, em mês aberto; classificar reclassifica em qualquer situação", async () => {
  const t = await pagarPendente(100);
  await tx((x) => cancelarTituloTx(x, "pagar", t.id));
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } })).status, "CANCELADO");
  await assert.rejects(tx((x) => cancelarTituloTx(x, "pagar", t.id)), /em aberto e sem baixas/);

  const comBaixa = await pagarPendente(100);
  await tx((x) => registrarBaixa(x, { tipo: "pagar", tituloId: comBaixa.id, contaId: contaA, data: dia(0), valor: 30, juros: 0, multa: 0, desconto: 0 }));
  await assert.rejects(tx((x) => cancelarTituloTx(x, "pagar", comBaixa.id)), /em aberto e sem baixas/);

  const fechada = await pagarPendente(100, DIA_FECHADO);
  await comMesFechado(async () => {
    await assert.rejects(tx((x) => cancelarTituloTx(x, "pagar", fechada.id)), /está fechado/);
    await assert.rejects(tx((x) => classificarTituloTx(x, "pagar", fechada.id, { planoContaId: planoOk, centroCustoId: null, competencia: dia(0) })), /está fechado/);
  });

  // reclassifica título já baixado (não mexe em valor nem em baixas)
  await tx((x) => classificarTituloTx(x, "pagar", comBaixa.id, { planoContaId: planoOk, centroCustoId: null, competencia: dia(0) }));
  const lido = await db.contaPagar.findUniqueOrThrow({ where: { id: comBaixa.id } });
  assert.equal(lido.planoContaId, planoOk);
  assert.equal(num(lido.valorBaixado), 30);
  await assert.rejects(tx((x) => classificarTituloTx(x, "pagar", "nao-existe", { planoContaId: planoOk, centroCustoId: null, competencia: dia(0) })), /Título não encontrado/);
  await assert.rejects(tx((x) => classificarTituloTx(x, "pagar", comBaixa.id, { planoContaId: grupo, centroCustoId: null, competencia: dia(0) })), /é um grupo/);
});

test("lançamento avulso: conta inativa e mês fechado recusam; excluir recusa baixa de título e conciliado", async () => {
  const d = { sentido: "SAIDA" as const, descricao: `${P} tarifa`, planoContaId: planoOk, centroCustoId: null, valor: 15, data: dia(0) };
  const lan = await tx((x) => lancarAvulsoTx(x, contaA, d));
  assert.equal(num(lan.valor), 15);
  await assert.rejects(tx((x) => lancarAvulsoTx(x, "nao-existe", d)), /Conta inexistente ou inativa/);
  await comMesFechado(async () => {
    await assert.rejects(tx((x) => lancarAvulsoTx(x, contaA, { ...d, data: DIA_FECHADO })), /está fechado/);
    const antigo = await db.lancamento.create({ data: { contaId: contaA, data: DIA_FECHADO, sentido: "SAIDA", valor: 3, descricao: `${P} antigo` } });
    await assert.rejects(tx((x) => excluirLancamentoAvulsoTx(x, antigo.id)), /está fechado/);
    assert.equal(await db.lancamento.count({ where: { id: antigo.id } }), 1);
  });

  const baixa = await pagarPendente(40);
  const lb = await tx((x) => registrarBaixa(x, { tipo: "pagar", tituloId: baixa.id, contaId: contaA, data: dia(0), valor: 40, juros: 0, multa: 0, desconto: 0 }));
  await assert.rejects(tx((x) => excluirLancamentoAvulsoTx(x, lb.id)), /baixa de título/);

  const conciliado = await tx((x) => lancarAvulsoTx(x, contaA, d));
  await db.extratoLinha.create({ data: { contaId: contaA, data: dia(0), valor: -15, descricao: `${P} l`, fitid: `${P}-${conciliado.id}`, lancamentoId: conciliado.id } });
  await assert.rejects(tx((x) => excluirLancamentoAvulsoTx(x, conciliado.id)), /conciliado com o extrato/);
  await db.extratoLinha.deleteMany({ where: { lancamentoId: conciliado.id } });

  assert.equal(await tx((x) => excluirLancamentoAvulsoTx(x, lan.id)), contaA);
  assert.equal(await db.lancamento.count({ where: { id: lan.id } }), 0);
  await assert.rejects(tx((x) => excluirLancamentoAvulsoTx(x, lan.id)), /não encontrado/);
});

test("inativar conta com saldo é recusado; zerada inativa e reativa", async () => {
  const c = (await db.contaBancaria.create({ data: { nome: `${P} serv saldo`, tipo: "BANCO", saldoInicial: 100 } })).id;
  await assert.rejects(alternarAtivoContaTx(db, c), /A conta tem saldo de/);
  await db.contaBancaria.update({ where: { id: c }, data: { saldoInicial: 0 } });
  const r1 = await alternarAtivoContaTx(db, c);
  assert.equal(r1.eraAtiva, true);
  assert.equal((await db.contaBancaria.findUniqueOrThrow({ where: { id: c } })).ativo, false);
  const r2 = await alternarAtivoContaTx(db, c);
  assert.equal(r2.eraAtiva, false);
  assert.equal((await db.contaBancaria.findUniqueOrThrow({ where: { id: c } })).ativo, true);
});

test("fechamento: mês inválido, corrente, já fechado; fecha mês vazio e reabre; reabrir mês aberto é recusado", async () => {
  await assert.rejects(fecharMesTx(db, "2024-13", "u"), /Mês inválido/);
  await assert.rejects(fecharMesTx(db, dia(0).toISOString().slice(0, 7), "u"), /já terminaram/);
  if (vazioJaFechado) return;
  await fecharMesTx(db, MES_VAZIO, "usuario-teste");
  assert.equal((await db.fechamentoMes.findUniqueOrThrow({ where: { mes: MES_VAZIO } })).usuarioId, "usuario-teste");
  await assert.rejects(fecharMesTx(db, MES_VAZIO, "u"), /já está fechado/);
  await reabrirMesTx(db, MES_VAZIO);
  await assert.rejects(reabrirMesTx(db, MES_VAZIO), /não está fechado/);
});

test("plano de contas: código/tipo/pai validados, código repetido e inativação com regras; centro de custo", async () => {
  const novo = (o: Partial<{ codigo: string; nome: string; tipo: string; paiId: string | null; analitica: boolean }>) =>
    tx((x) => criarContaPlanoTx(x, { codigo: "96.50", nome: `${P} filha`, tipo: "DESPESA", paiId: grupo, analitica: true, ...o }));
  await assert.rejects(novo({ codigo: "abc" }), /Código inválido/);
  await assert.rejects(novo({ paiId: "nao-existe" }), /Grupo não encontrado/);
  await assert.rejects(novo({ paiId: planoOk }), /não pode ter filhas/);
  await assert.rejects(novo({ tipo: "RECEITA" }), /mesmo tipo do grupo/);
  await assert.rejects(novo({ codigo: "95.50" }), /precisa começar com 96\./);
  await assert.rejects(novo({ codigo: "96.01" }), /Já existe uma conta com o código/);
  const filha = await novo({});
  assert.equal(filha.paiId, grupo);
  await assert.rejects(tx((x) => alternarContaPlanoTx(x, grupo)), /Inative primeiro as contas dentro deste grupo/);
  const sistema = await db.planoConta.findFirstOrThrow({ where: { chaveSistema: { not: null }, ativo: true } });
  await assert.rejects(tx((x) => alternarContaPlanoTx(x, sistema.id)), /usada pelo sistema/);
  assert.equal((await tx((x) => alternarContaPlanoTx(x, filha.id))).eraAtiva, true);
  await assert.rejects(tx((x) => alternarContaPlanoTx(x, "nao-existe")), /Conta não encontrada/);
  await tx((x) => alternarContaPlanoTx(x, planoOk)); // inativa a outra filha
  await tx((x) => alternarContaPlanoTx(x, grupo)); // agora o grupo inativa
  await assert.rejects(tx((x) => alternarContaPlanoTx(x, filha.id)), /Reative primeiro o grupo/);

  const cc = await tx((x) => criarCentroCustoTx(x, { codigo: "TESTEDB-CC", nome: `${P} centro` }));
  await assert.rejects(tx((x) => criarCentroCustoTx(x, { codigo: "TESTEDB-CC", nome: `${P} outro` })), /Já existe um centro de custo/);
  assert.equal((await tx((x) => alternarCentroCustoTx(x, cc.id))).eraAtivo, true);
  await assert.rejects(tx((x) => alternarCentroCustoTx(x, "nao-existe")), /Centro de custo não encontrado/);
});

test("remessa SISPAG pela conta: caixa, conta inexistente e conta sem dados do titular são recusadas antes de qualquer título", async () => {
  const args = (contaId: string) => ({ contaId, modo: "TED_BOLETO" as const, dataPagto: dia(1), ids: ["qualquer"] });
  const caixa = (await db.contaBancaria.create({ data: { nome: `${P} caixa`, tipo: "CAIXA", saldoInicial: 0 } })).id;
  await assert.rejects(tx((x) => gerarRemessaDaContaTx(x, args(caixa))), /Conta bancária inexistente ou inativa/);
  await assert.rejects(tx((x) => gerarRemessaDaContaTx(x, args("nao-existe"))), /Conta bancária inexistente ou inativa/);
  await assert.rejects(tx((x) => gerarRemessaDaContaTx(x, args(contaA))), /Complete a conta bancária/);
});
