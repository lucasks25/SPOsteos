/** Recebimento de compra: quarentena, custo médio, conta a pagar, limites do pedido e concorrência. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS } from "@/lib/estoque";
import { hojeUTC } from "@/app/(app)/compras/_lib/perfis";
import { hojeUTC as hojeBrasilia } from "@/app/(app)/financeiro/_lib/datas";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { conferirKardex, dia, limparTudo, mkFornecedor, mkProduto, num, saldoDe } from "./_util";

let fornecedorId: string, planoEstoque: string;
before(async () => {
  await limparTudo();
  fornecedorId = (await mkFornecedor()).id;
  planoEstoque = (await db.planoConta.findUniqueOrThrow({ where: { chaveSistema: "ESTOQUE" } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

async function pedido(produtoId: string, quantidade: number, custoUnit: number) {
  const p = await db.pedidoCompra.create({ data: { fornecedorId, itens: { create: [{ produtoId, quantidade, custoUnit }] } }, include: { itens: true } });
  return { id: p.id, itemId: p.itens[0].id };
}
const receber = (itemId: string, quantidade: number, lote = "L1", validade = dia(365)) =>
  db.$transaction((tx) => receberItemTx(tx, { itemId, quantidade, lote, validade, fabricacao: null, serie: null, usuario: "teste" }));
const status = async (id: number) => (await db.pedidoCompra.findUniqueOrThrow({ where: { id } })).status;

test("recebimento: lote novo vai para QUARENTENA, entrada na quarentena, conta a pagar com plano ESTOQUE e competência de hoje", async () => {
  const prod = await mkProduto();
  const ped = await pedido(prod.id, 10, 25.5);
  const r = await receber(ped.itemId, 4, "LOTE-A");
  const lote = await db.lote.findUniqueOrThrow({ where: { produtoId_numero: { produtoId: prod.id, numero: "LOTE-A" } } });
  assert.equal(lote.status, "QUARENTENA");
  assert.equal(await saldoDe(lote.id, LOCAIS.QUARENTENA), 4);
  assert.equal(await saldoDe(lote.id, LOCAIS.DEPOSITO), 0);
  const mov = await db.movimento.findMany({ where: { loteId: lote.id } });
  assert.deepEqual(mov.map((m) => [m.tipo, m.quantidade, m.documento, num(m.custoUnit)]), [["ENTRADA", 4, `PC-${ped.id}`, 25.5]]);
  assert.equal(await status(ped.id), "PARCIAL");
  assert.equal(r.completo, false);

  const cp = await db.contaPagar.findMany({ where: { pedidoId: ped.id } });
  assert.equal(cp.length, 1);
  assert.equal(num(cp[0].valor), 102); // 4 x 25,50
  assert.equal(cp[0].planoContaId, planoEstoque);
  assert.equal(cp[0].fornecedorId, fornecedorId);
  assert.equal(cp[0].status, "ABERTO");
  assert.equal(cp[0].competencia.getTime(), hojeUTC().getTime());
  assert.equal(cp[0].vencimento.getTime(), dia(30).getTime());
  await conferirKardex(lote.id);
});

test("recebimento completo fecha o pedido (RECEBIDO) e depois nada mais pode ser recebido; mesmo lote soma no saldo", async () => {
  const prod = await mkProduto();
  const ped = await pedido(prod.id, 5, 10);
  await receber(ped.itemId, 2, "L-X");
  const r = await receber(ped.itemId, 3, "L-X");
  assert.equal(r.completo, true);
  assert.equal(await status(ped.id), "RECEBIDO");
  const lote = await db.lote.findUniqueOrThrow({ where: { produtoId_numero: { produtoId: prod.id, numero: "L-X" } } });
  assert.equal(await saldoDe(lote.id, LOCAIS.QUARENTENA), 5);
  assert.equal(await db.contaPagar.count({ where: { pedidoId: ped.id } }), 2);
  await assert.rejects(receber(ped.itemId, 1, "L-X"), /já recebido/);
});

test("custo médio ponderado pelo saldo anterior (todos os locais)", async () => {
  const prod = await mkProduto({ custoMedio: 0 });
  const p1 = await pedido(prod.id, 10, 10);
  await receber(p1.itemId, 10, "L1"); // saldo 0 → custo 10
  assert.equal(num((await db.produto.findUniqueOrThrow({ where: { id: prod.id } })).custoMedio), 10);
  const p2 = await pedido(prod.id, 10, 20);
  await receber(p2.itemId, 10, "L2"); // (10*10 + 10*20)/20 = 15
  assert.equal(num((await db.produto.findUniqueOrThrow({ where: { id: prod.id } })).custoMedio), 15);
  const p3 = await pedido(prod.id, 5, 30);
  await receber(p3.itemId, 5, "L3"); // (20*15 + 5*30)/25 = 18
  assert.equal(num((await db.produto.findUniqueOrThrow({ where: { id: prod.id } })).custoMedio), 18);
});

test("recusas: acima do pendente, validade vencida, fabricação > validade, lote existente com outra validade, pedido cancelado", async () => {
  const prod = await mkProduto();
  const ped = await pedido(prod.id, 5, 10);
  await assert.rejects(receber(ped.itemId, 6), /maior que a pendente \(5\)/);
  await assert.rejects(receber(ped.itemId, 1, "LV", dia(-1)), /vencida/);
  await assert.rejects(
    db.$transaction((tx) => receberItemTx(tx, { itemId: ped.itemId, quantidade: 1, lote: "LF", validade: dia(10), fabricacao: dia(20), serie: null, usuario: "t" })),
    /fabricação posterior/,
  );
  await receber(ped.itemId, 2, "LD", dia(100));
  await assert.rejects(receber(ped.itemId, 1, "LD", dia(200)), /validade diferente/);
  // nada disso deixou recebimento parcial gravado
  assert.equal((await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: ped.itemId } })).recebido, 2);
  assert.equal(await db.contaPagar.count({ where: { pedidoId: ped.id } }), 1);
  await db.pedidoCompra.update({ where: { id: ped.id }, data: { status: "CANCELADO" } });
  await assert.rejects(receber(ped.itemId, 1, "LD", dia(100)), /cancelado/);
  await assert.rejects(receber("nao-existe", 1), /não encontrado/);
});

test("dois recebimentos simultâneos não passam do pedido", async () => {
  const prod = await mkProduto();
  const ped = await pedido(prod.id, 5, 10);
  const r = await Promise.allSettled([receber(ped.itemId, 3, "LC1"), receber(ped.itemId, 3, "LC2")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1, "só um dos dois cabe no pedido");
  const item = await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: ped.itemId } });
  assert.equal(item.recebido, 3);
  const agg = await db.saldo.aggregate({ where: { produtoId: prod.id }, _sum: { quantidade: true } });
  assert.equal(agg._sum.quantidade, 3);
  assert.equal(await db.contaPagar.count({ where: { pedidoId: ped.id } }), 1);
});

// BUG: compras/_lib/perfis.ts:10 (hojeUTC) usa a data UTC; o resto do sistema usa o dia de Brasília (financeiro/_lib/datas.ts:21).
// Recebimento entre 21h e 23h59 (BRT) grava competência do dia seguinte, e no último dia do mês cai no mês errado do DRE
// (recebimento.ts:96 usa essa data como competência da conta a pagar).
test("competência da conta a pagar é o dia de Brasília (recebimento às 23h30 do último dia do mês)", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T02:30:00Z") }); // 31/10 23h30 em Brasília
  try {
    assert.equal(hojeUTC().toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(hojeUTC().getTime(), hojeBrasilia().getTime());
  } finally {
    mock.timers.reset();
  }
});
