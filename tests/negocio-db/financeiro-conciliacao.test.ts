/**
 * Conciliação bancária (serviço, sem login): importar extrato, baixar e conciliar, avulso, conciliar com lançamento existente,
 * desfazer e excluir linha. Caracteriza as regras que estavam inline em conciliacao-actions.ts. Dados com prefixo TESTEDB.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  avulsoEConciliarTx,
  baixarEConciliarTx,
  conciliarComLancamentoTx,
  desfazerConciliacaoTx,
  excluirLinhaExtratoTx,
  importarExtratoTexto,
} from "@/app/(app)/financeiro/_lib/conciliacao-servico";
import { dia, limparTudo, mkFornecedor, mkHospital, num, P, uid } from "./_util";

const MES_FECHADO = "2024-07";
const DIA_FECHADO = new Date("2024-07-10T00:00:00Z");
let mesJaFechado = false;
let contaA: string, contaB: string, planoOk: string, grupo: string;

async function limpar() {
  const contas = await db.contaBancaria.findMany({ where: { nome: { startsWith: P } }, select: { id: true } });
  const ids = contas.map((c) => c.id);
  await db.extratoLinha.deleteMany({ where: { contaId: { in: ids } } });
  await db.lancamento.deleteMany({ where: { contaId: { in: ids } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: P } } });
  await db.planoConta.deleteMany({ where: { nome: { startsWith: P } } });
  await limparTudo();
}

before(async () => {
  await limpar();
  mesJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_FECHADO } }));
  contaA = (await db.contaBancaria.create({ data: { nome: `${P} conc A`, tipo: "BANCO", saldoInicial: 0, agencia: "1234", numero: "123456" } })).id;
  contaB = (await db.contaBancaria.create({ data: { nome: `${P} conc B`, tipo: "BANCO", saldoInicial: 0 } })).id;
  planoOk = (await db.planoConta.create({ data: { codigo: "97.01", nome: `${P} tarifa`, tipo: "DESPESA", analitica: true } })).id;
  grupo = (await db.planoConta.create({ data: { codigo: "97", nome: `${P} grupo`, tipo: "DESPESA", analitica: false } })).id;
});
after(async () => {
  if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  await limpar();
  await db.$disconnect();
});

const linha = (valor: number, o: { contaId?: string; data?: Date; origem?: string } = {}) =>
  db.extratoLinha.create({ data: { contaId: o.contaId ?? contaA, data: o.data ?? dia(0), valor, descricao: `${P} linha`, fitid: uid(), origem: o.origem ?? "OFX" } });
const lerLinha = (id: string) => db.extratoLinha.findUniqueOrThrow({ where: { id } });
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

async function receber(valor: number) {
  const h = await mkHospital();
  return db.contaReceber.create({ data: { descricao: `${P} receber`, valor, vencimento: dia(10), competencia: dia(0), hospitalId: h.id } });
}
async function pagar(valor: number) {
  const f = await mkFornecedor();
  return db.contaPagar.create({ data: { descricao: `${P} pagar`, valor, vencimento: dia(10), competencia: dia(0), fornecedorId: f.id, aprovadoEm: new Date() } });
}

test("baixar e conciliar um crédito com juros e desconto: título a receber quitado, lançamento com o valor do extrato, linha ligada", async () => {
  const t = await receber(1000);
  const l = await linha(1010);
  await tx((x) => baixarEConciliarTx(x, l.id, { tituloId: t.id, juros: 30, multa: 0, desconto: 20 }));
  const titulo = await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(titulo.status, "PAGO");
  const linhaDepois = await lerLinha(l.id);
  assert.ok(linhaDepois.lancamentoId && linhaDepois.conciliadoEm);
  const lan = await db.lancamento.findUniqueOrThrow({ where: { id: linhaDepois.lancamentoId! } });
  assert.equal(lan.sentido, "ENTRADA");
  assert.equal(lan.contaId, contaA);
  assert.equal(num(lan.valor), 1010);
  assert.equal(num(lan.juros), 30);
  assert.equal(num(lan.desconto), 20);
  assert.equal(lan.contaReceberId, t.id);
  // a mesma linha não concilia duas vezes
  await assert.rejects(tx((x) => baixarEConciliarTx(x, l.id, { tituloId: t.id, juros: 0, multa: 0, desconto: 0 })), /já está conciliada/);
});

test("baixar e conciliar um débito baixa conta a pagar (parcial) e usa a data da linha", async () => {
  const t = await pagar(500);
  const l = await linha(-200);
  await tx((x) => baixarEConciliarTx(x, l.id, { tituloId: t.id, juros: 0, multa: 0, desconto: 0 }));
  const titulo = await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(titulo.status, "ABERTO");
  assert.equal(num(titulo.valorBaixado), 200);
  const lan = await db.lancamento.findUniqueOrThrow({ where: { id: (await lerLinha(l.id)).lancamentoId! } });
  assert.equal(lan.sentido, "SAIDA");
  assert.equal(num(lan.valor), 200);
  assert.equal(lan.data.getTime(), l.data.getTime());
});

test("baixa acima do saldo é recusada e a linha continua pendente (nada gravado)", async () => {
  const t = await receber(100);
  const l = await linha(250);
  await assert.rejects(tx((x) => baixarEConciliarTx(x, l.id, { tituloId: t.id, juros: 0, multa: 0, desconto: 0 })));
  assert.equal((await lerLinha(l.id)).lancamentoId, null);
  assert.equal((await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } })).status, "ABERTO");
  assert.equal(await db.lancamento.count({ where: { contaReceberId: t.id } }), 0);
  await assert.rejects(tx((x) => baixarEConciliarTx(x, "inexistente", { tituloId: t.id, juros: 0, multa: 0, desconto: 0 })), /Linha do extrato não encontrada/);
});

test("avulso: tarifa vira lançamento de saída classificado e conciliado; grupo do plano é recusado", async () => {
  const l = await linha(-45.9);
  await tx((x) => avulsoEConciliarTx(x, l.id, { descricao: `${P} tarifa`, planoContaId: planoOk, centroCustoId: null }));
  const lan = await db.lancamento.findUniqueOrThrow({ where: { id: (await lerLinha(l.id)).lancamentoId! } });
  assert.equal(lan.sentido, "SAIDA");
  assert.equal(num(lan.valor), 45.9);
  assert.equal(lan.planoContaId, planoOk);
  assert.equal(lan.contaReceberId, null);

  const l2 = await linha(12);
  await assert.rejects(tx((x) => avulsoEConciliarTx(x, l2.id, { descricao: `${P} x`, planoContaId: grupo, centroCustoId: null })), /é um grupo/);
  assert.equal((await lerLinha(l2.id)).lancamentoId, null);
});

test("avulso em mês fechado é recusado e a linha continua pendente; reaberto passa", async () => {
  const l = await linha(8, { data: DIA_FECHADO });
  if (!mesJaFechado) await db.fechamentoMes.create({ data: { mes: MES_FECHADO } });
  try {
    await assert.rejects(tx((x) => avulsoEConciliarTx(x, l.id, { descricao: `${P} rend`, planoContaId: planoOk, centroCustoId: null })), /está fechado/);
    assert.equal((await lerLinha(l.id)).lancamentoId, null);
    assert.equal(await db.lancamento.count({ where: { contaId: contaA, data: DIA_FECHADO } }), 0);
  } finally {
    if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  }
  if (!mesJaFechado) await tx((x) => avulsoEConciliarTx(x, l.id, { descricao: `${P} rend`, planoContaId: planoOk, centroCustoId: null }));
});

test("conciliar com lançamento existente: confere conta, sentido, valor e disponibilidade", async () => {
  const mk = (o: { contaId?: string; sentido?: "ENTRADA" | "SAIDA"; valor?: number } = {}) =>
    db.lancamento.create({ data: { contaId: o.contaId ?? contaA, data: dia(0), sentido: o.sentido ?? "ENTRADA", valor: o.valor ?? 300, descricao: `${P} lan` } });
  const l = await linha(300);
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l.id, "nao-existe")), /indisponível/);
  const outraConta = await mk({ contaId: contaB });
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l.id, outraConta.id)), /outra conta/);
  const sentido = await mk({ sentido: "SAIDA" });
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l.id, sentido.id)), /Entrada\/saída não confere/);
  const valor = await mk({ valor: 299.99 });
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l.id, valor.id)), /valor do lançamento difere/);
  assert.equal((await lerLinha(l.id)).lancamentoId, null);

  const ok = await mk();
  await tx((x) => conciliarComLancamentoTx(x, l.id, ok.id));
  assert.equal((await lerLinha(l.id)).lancamentoId, ok.id);
  // o lançamento já conciliado não serve para outra linha, e a linha já conciliada não concilia de novo
  const l2 = await linha(300);
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l2.id, ok.id)), /indisponível/);
  await assert.rejects(tx((x) => conciliarComLancamentoTx(x, l.id, ok.id)), /já está conciliada/);
});

test("desfazer: solta a linha e o lançamento continua; desfazer de novo é recusado", async () => {
  const l = await linha(-20);
  await tx((x) => avulsoEConciliarTx(x, l.id, { descricao: `${P} t`, planoContaId: planoOk, centroCustoId: null }));
  const lanId = (await lerLinha(l.id)).lancamentoId!;
  await tx((x) => desfazerConciliacaoTx(x, l.id));
  const depois = await lerLinha(l.id);
  assert.equal(depois.lancamentoId, null);
  assert.equal(depois.conciliadoEm, null);
  assert.ok(await db.lancamento.findUnique({ where: { id: lanId } }));
  await assert.rejects(tx((x) => desfazerConciliacaoTx(x, l.id)), /não está conciliada/);
});

test("excluir linha: pendente sai; conciliada ou inexistente é recusada", async () => {
  const pend = await linha(5);
  await tx((x) => excluirLinhaExtratoTx(x, pend.id));
  assert.equal(await db.extratoLinha.count({ where: { id: pend.id } }), 0);
  await assert.rejects(tx((x) => excluirLinhaExtratoTx(x, pend.id)), /inexistente ou já conciliada/);

  const conc = await linha(-7);
  await tx((x) => avulsoEConciliarTx(x, conc.id, { descricao: `${P} t`, planoContaId: planoOk, centroCustoId: null }));
  await assert.rejects(tx((x) => excluirLinhaExtratoTx(x, conc.id)), /inexistente ou já conciliada/);
  assert.equal(await db.extratoLinha.count({ where: { id: conc.id } }), 1);
});

const OFX = (fitids: [string, string, string][]) =>
  `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n${fitids
    .map(([id, data, v]) => `<STMTTRN>\n<DTPOSTED>${data}\n<TRNAMT>${v}\n<FITID>${id}\n<MEMO>${P} mov\n</STMTTRN>`)
    .join("\n")}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("importar extrato: grava as linhas, reimportar não duplica e arquivos/contas inválidos são recusados", async () => {
  const c = (await db.contaBancaria.create({ data: { nome: `${P} imp`, tipo: "BANCO", saldoInicial: 0 } })).id;
  const arq = OFX([
    [`${P}1`, "20260105", "100.00"],
    [`${P}2`, "20260106", "-30.50"],
  ]);
  const r1 = await importarExtratoTexto(c, arq);
  assert.deepEqual([r1.origem, r1.novas, r1.existentes], ["OFX", 2, 0]);
  assert.equal(await db.extratoLinha.count({ where: { contaId: c } }), 2);

  const r2 = await importarExtratoTexto(c, OFX([[`${P}1`, "20260105", "100.00"], [`${P}2`, "20260106", "-30.50"], [`${P}3`, "20260107", "9.00"]]));
  assert.deepEqual([r2.novas, r2.existentes], [1, 2]);
  assert.equal(await db.extratoLinha.count({ where: { contaId: c } }), 3);

  await assert.rejects(importarExtratoTexto(c, "qualquer coisa"), /Arquivo não reconhecido/);
  await assert.rejects(importarExtratoTexto("inexistente", arq), /Conta inexistente ou inativa/);
  await db.contaBancaria.update({ where: { id: c }, data: { ativo: false } });
  await assert.rejects(importarExtratoTexto(c, arq), /Conta inexistente ou inativa/);
});

test("importar OFX num período que já tem extrato CNAB da conta é recusado e nada é gravado", async () => {
  const c = (await db.contaBancaria.create({ data: { nome: `${P} imp2`, tipo: "BANCO", saldoInicial: 0 } })).id;
  await db.extratoLinha.create({ data: { contaId: c, data: new Date("2026-01-06T00:00:00Z"), valor: 10, descricao: `${P} cnab`, fitid: `${P}-cnab`, origem: "CNAB" } });
  await assert.rejects(importarExtratoTexto(c, OFX([[`${P}9`, "20260105", "1.00"], [`${P}8`, "20260107", "2.00"]])), /já tem extrato CNAB importado neste período/);
  assert.equal(await db.extratoLinha.count({ where: { contaId: c } }), 1);
  // fora do período do CNAB o OFX passa
  const r = await importarExtratoTexto(c, OFX([[`${P}7`, "20260301", "1.00"]]));
  assert.equal(r.novas, 1);
});
