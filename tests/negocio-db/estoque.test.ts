/** movimentar(): saldo nunca negativo, Saldo == Kardex, transferência atômica. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { conferirKardex, limparTudo, mkLote, mkProduto, saldoDe } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const mov = (m: Parameters<typeof movimentar>[1]) => db.$transaction((tx) => movimentar(tx, m));

test("entrada, transferência e saída mantêm Saldo == Kardex; saída acima do saldo é recusada com mensagem", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  const base = { produtoId: p.id, loteId: l.id };
  await mov({ ...base, tipo: "ENTRADA", quantidade: 10, destinoId: LOCAIS.QUARENTENA });
  await mov({ ...base, tipo: "TRANSFERENCIA", quantidade: 6, origemId: LOCAIS.QUARENTENA, destinoId: LOCAIS.DEPOSITO });
  await mov({ ...base, tipo: "CONSUMO", quantidade: 2, origemId: LOCAIS.DEPOSITO });
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 4);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 4);
  await assert.rejects(mov({ ...base, tipo: "PERDA", quantidade: 5, origemId: LOCAIS.DEPOSITO }), /Saldo insuficiente.*Dispon[ií]vel: 4/);
  await assert.rejects(mov({ ...base, tipo: "TRANSFERENCIA", quantidade: 5, origemId: LOCAIS.QUARENTENA, destinoId: LOCAIS.DEPOSITO }), /Saldo insuficiente/);
  // a recusa não deixa rastro: nem saldo, nem kardex
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 4);
  assert.equal(await db.movimento.count({ where: { loteId: l.id } }), 3);
  await conferirKardex(l.id);
});

test("saída de lote sem nenhum saldo no local é recusada; quantidade inválida e movimento sem local também", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  const base = { produtoId: p.id, loteId: l.id, tipo: "PERDA" as const };
  await assert.rejects(mov({ ...base, quantidade: 1, origemId: LOCAIS.DEPOSITO }), /Saldo insuficiente.*Dispon[ií]vel: 0/);
  await assert.rejects(mov({ ...base, quantidade: 0, origemId: LOCAIS.DEPOSITO }), /inteiro positivo/);
  await assert.rejects(mov({ ...base, quantidade: -3, destinoId: LOCAIS.DEPOSITO }), /inteiro positivo/);
  await assert.rejects(mov({ ...base, quantidade: 1.5, destinoId: LOCAIS.DEPOSITO }), /inteiro positivo/);
  await assert.rejects(mov({ ...base, quantidade: 1 }), /sem origem nem destino/);
  assert.equal(await db.movimento.count({ where: { loteId: l.id } }), 0);
});

test("transação que falha no meio desfaz o saldo (atomicidade)", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  const base = { produtoId: p.id, loteId: l.id };
  await mov({ ...base, tipo: "ENTRADA", quantidade: 5, destinoId: LOCAIS.DEPOSITO });
  await assert.rejects(
    db.$transaction(async (tx) => {
      await movimentar(tx, { ...base, tipo: "CONSUMO", quantidade: 3, origemId: LOCAIS.DEPOSITO });
      await movimentar(tx, { ...base, tipo: "CONSUMO", quantidade: 3, origemId: LOCAIS.DEPOSITO }); // estoura
    }),
    /Saldo insuficiente/,
  );
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 5);
  await conferirKardex(l.id);
});

// BUG: ajustarSaldo (src/lib/estoque.ts:27-41) faz leitura + upsert do valor absoluto, sem lock/incremento atômico:
// saídas concorrentes do mesmo lote/local perdem atualização (Saldo diverge do Kardex e pode passar do disponível).
test("saídas simultâneas não perdem atualização: Saldo == Kardex e nunca negativo", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  const base = { produtoId: p.id, loteId: l.id };
  await mov({ ...base, tipo: "ENTRADA", quantidade: 5, destinoId: LOCAIS.DEPOSITO });
  const r = await Promise.allSettled(
    Array.from({ length: 4 }, () => mov({ ...base, tipo: "CONSUMO", quantidade: 2, origemId: LOCAIS.DEPOSITO })),
  );
  const ok = r.filter((x) => x.status === "fulfilled").length;
  const saldo = await saldoDe(l.id, LOCAIS.DEPOSITO);
  assert.ok(saldo >= 0, `saldo negativo: ${saldo}`);
  assert.equal(saldo, 5 - 2 * ok, `${ok} saídas de 2 deram certo mas o saldo ficou ${saldo}`);
  await conferirKardex(l.id);
});
