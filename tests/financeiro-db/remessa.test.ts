/**
 * Remessa SISPAG contra o banco: trava de concorrência, cancelamento e alertas do retorno.
 * Cria dados com prefixo TESTEDB e apaga no final. Rode com `npm run test:db`.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeUTC } from "@/lib/datas";
import { aplicarRetornoTx, cancelarRemessaTx, contagemVazia, gerarRemessaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { registrarBaixa } from "@/app/(app)/financeiro/_lib/titulos";
import { aprovarFavorecidosTeste } from "../negocio-db/_util";

const hoje = hojeUTC();
let conta: { id: string; titularCnpj: string; titularNome: string; agencia: string };
let fornecedorId: string;
const cd = { conta: "12345", dac: "6" };
const CNPJ = "11222333000181";

async function limpar() {
  const itens = await db.remessaPagamentoItem.findMany({ where: { contaPagar: { descricao: { startsWith: "TESTEDB" } } }, select: { remessaId: true } });
  await db.remessaPagamento.deleteMany({ where: { id: { in: itens.map((i) => i.remessaId) } } });
  await db.extratoLinha.deleteMany({ where: { conta: { nome: { startsWith: "TESTEDB" } } } });
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.remessaPagamento.deleteMany({ where: { conta: { nome: { startsWith: "TESTEDB" } } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.fornecedor.deleteMany({ where: { razaoSocial: { startsWith: "TESTEDB" } } });
}

before(async () => {
  await limpar();
  const c = await db.contaBancaria.create({ data: { nome: "TESTEDB banco", tipo: "BANCO", banco: "341", agencia: "1234", numero: "123456", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", saldoInicial: 100000 } });
  conta = { id: c.id, titularCnpj: c.titularCnpj!, titularNome: c.titularNome!, agencia: c.agencia! };
  fornecedorId = (await db.fornecedor.create({ data: { razaoSocial: "TESTEDB Fornecedor", cnpj: CNPJ, bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" } })).id;
  await aprovarFavorecidosTeste();
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = (valor = 1000) => db.contaPagar.create({ data: { descricao: "TESTEDB pagar", valor, vencimento: hoje, competencia: hoje, fornecedorId, aprovadoEm: new Date() } });
const gerar = (ids: string[]) => db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd, modo: "TED_BOLETO", dataPagto: hoje, ids }));
const retornoPago = (itemId: number, valor: number) => [{ seuNumero: `SP${itemId}`, segmento: "A" as const, ocorrencias: ["00"], nossoNumero: "", dataEfetiva: hoje, valorEfetivo: valor }];
const aplicar = async (res: ReturnType<typeof retornoPago>) => {
  const cont = contagemVazia();
  await db.$transaction((tx) => aplicarRetornoTx(tx, res, cont));
  return cont;
};

test("dois pedidos simultâneos para o mesmo título: só uma remessa é gerada", async () => {
  const t = await titulo();
  const r = await Promise.allSettled([gerar([t.id]), gerar([t.id])]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  const rej = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rej.reason.message), /já está em outra remessa/);
  assert.equal(await db.remessaPagamentoItem.count({ where: { contaPagarId: t.id, status: "ENVIADO" } }), 1);
});

test("o banco recusa dois pagamentos ativos do mesmo título (índice único parcial)", async () => {
  const t = await titulo();
  const { remessaId } = await gerar([t.id]);
  await assert.rejects(db.remessaPagamentoItem.create({ data: { remessaId, contaPagarId: t.id, forma: "41", valor: 1000 } }), /titulo_ativo|Unique constraint/i);
});

test("cancelar remessa libera o título para outra; cancelar de novo e remessa com pago são recusados", async () => {
  const t = await titulo();
  const a = await gerar([t.id]);
  await db.$transaction((tx) => cancelarRemessaTx(tx, a.remessaId, "arquivo recusado pelo banco"));
  const b = await gerar([t.id]); // agora pode
  await assert.rejects(db.$transaction((tx) => cancelarRemessaTx(tx, a.remessaId, "de novo")), /já foi cancelada/);
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { remessaId: b.remessaId } });
  await aplicar(retornoPago(item.id, 1000));
  await assert.rejects(db.$transaction((tx) => cancelarRemessaTx(tx, b.remessaId, "tarde demais")), /pagamentos confirmados ou agendados/);
});

test("retorno de título já quitado à mão: sem segunda baixa e com alerta DUP", async () => {
  const t = await titulo();
  const r = await gerar([t.id]);
  await db.$transaction((tx) => registrarBaixa(tx, { tipo: "pagar", tituloId: t.id, contaId: conta.id, data: hoje, valor: 1000 })); // pago pelo app do banco
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { remessaId: r.remessaId } });
  const cont = await aplicar(retornoPago(item.id, 1000));
  assert.equal(cont.jaBaixados, 1);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: t.id } }), 1);
  const x = await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.match(x.ocorrencias ?? "", /DUP/);
});

test("banco pagou item de remessa cancelada: baixa feita e alerta CAN", async () => {
  const t = await titulo();
  const r = await gerar([t.id]);
  await db.$transaction((tx) => cancelarRemessaTx(tx, r.remessaId, "achei que não tinha enviado"));
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { remessaId: r.remessaId } });
  const cont = await aplicar(retornoPago(item.id, 1000));
  assert.equal(cont.canceladasPagas, 1);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } })).status, "PAGO");
  assert.match((await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: item.id } })).ocorrencias ?? "", /CAN/);
});

test("conta a pagar sem aprovação do financeiro não entra em remessa; depois de aprovada entra", async () => {
  const t = await db.contaPagar.create({ data: { descricao: "TESTEDB pendente", valor: 500, vencimento: hoje, competencia: hoje, fornecedorId } });
  await assert.rejects(gerar([t.id]), /aguardando aprovação/);
  await db.contaPagar.update({ where: { id: t.id }, data: { aprovadoEm: new Date() } });
  await gerar([t.id]);
});

// REVISAO §22: a conciliação baixou o título antes do retorno SISPAG chegar. Mesmo valor, mesma conta e extrato a ±3 dias
// = o mesmo pagamento ("já conciliado", sem alerta). Fora disso continua duplicidade.
async function pagoPelaConciliacao(valorExtrato: number, diasExtrato: number) {
  const t = await titulo();
  const r = await gerar([t.id]);
  await db.$transaction((tx) => registrarBaixa(tx, { tipo: "pagar", tituloId: t.id, contaId: conta.id, data: hoje, valor: valorExtrato, desconto: Math.round((1000 - valorExtrato) * 100) / 100 }));
  const lanc = await db.lancamento.findFirstOrThrow({ where: { contaPagarId: t.id } });
  await db.extratoLinha.create({ data: { contaId: conta.id, data: new Date(hoje.getTime() + diasExtrato * 86400000), valor: -valorExtrato, descricao: "TESTEDB debito", fitid: `TESTEDB-${t.id}`, lancamentoId: lanc.id, conciliadoEm: new Date() } });
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { remessaId: r.remessaId } });
  return { t, item };
}

test("retorno SISPAG de título baixado pela conciliação com o mesmo pagamento: 'já conciliado' (CONC), sem DUP", async () => {
  const { t, item } = await pagoPelaConciliacao(1000, -2);
  const cont = await aplicar(retornoPago(item.id, 1000));
  assert.equal(cont.jaConciliados, 1);
  assert.equal(cont.jaBaixados, 0);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: t.id } }), 1);
  const x = await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.match(x.ocorrencias ?? "", /CONC/);
  assert.doesNotMatch(x.ocorrencias ?? "", /DUP/);
});

test("retorno SISPAG de título conciliado com outro valor ou data distante continua DUP", async () => {
  const outroValor = await pagoPelaConciliacao(999, 0);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: outroValor.t.id } })).status, "PAGO"); // 999 + 1,00 de desconto
  const c1 = await aplicar(retornoPago(outroValor.item.id, 1000));
  assert.equal(c1.jaBaixados, 1);
  assert.equal(c1.jaConciliados, 0);
  const longe = await pagoPelaConciliacao(1000, -10);
  const c2 = await aplicar(retornoPago(longe.item.id, 1000));
  assert.equal(c2.jaBaixados, 1);
  assert.match((await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: longe.item.id } })).ocorrencias ?? "", /DUP/);
});
