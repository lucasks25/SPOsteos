/** Consumo em cirurgia: rota do vale (conferirRemessa) e rota direta (registrarConsumoDiretoTx / removerConsumoTx). */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { conferirRemessa, criarRemessa, enviarRemessa } from "@/app/(app)/estoque/_lib/remessas";
import { registrarConsumoDiretoTx, removerConsumoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { dia, limparTudo, mkHospital, mkLote, mkProduto, P, saldoDe, uid, conferirKardex } from "./_util";

let hospitalId: string, localHosp: string, medicoId: string;

before(async () => {
  await limparTudo();
  hospitalId = (await mkHospital()).id;
  localHosp = await db.$transaction((tx) => localDoHospital(tx, hospitalId));
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

type Status = "AGENDADA" | "CONFIRMADA" | "REALIZADA" | "FATURADA" | "CANCELADA";
const cirurgia = (status: Status = "AGENDADA") =>
  db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente`, status } });
const statusDe = async (id: string) => (await db.cirurgia.findUniqueOrThrow({ where: { id } })).status;
const consumosDe = (cirurgiaId: string) => db.cirurgiaConsumo.findMany({ where: { cirurgiaId } });

/** Estoca, cria e envia um vale de 5 unidades para a cirurgia (que ainda está no status informado ao criar). */
async function valeEnviado(cirurgiaId: string) {
  const p = await mkProduto({ custoMedio: 10, precoBase: 25 });
  const l = await mkLote(p.id);
  await db.$transaction((t) => movimentar(t, { tipo: "ENTRADA", produtoId: p.id, loteId: l.id, quantidade: 10, destinoId: LOCAIS.DEPOSITO, custoUnit: 10 }));
  const r = await db.$transaction((t) => criarRemessa(t, { hospitalId, cirurgiaId, itens: [{ produtoId: p.id, loteId: l.id, quantidade: 5 }] }));
  await db.$transaction((t) => enviarRemessa(t, r.id, "teste"));
  const [item] = await db.remessaItem.findMany({ where: { remessaId: r.id } });
  return { p, l, r, item };
}
const conferir = (v: Awaited<ReturnType<typeof valeEnviado>>, consumido: number) =>
  db.$transaction((t) => conferirRemessa(t, v.r.id, [{ itemId: v.item.id, devolvido: 0, consumido }], "teste"));

test("rota do vale: AGENDADA e CONFIRMADA viram REALIZADA ao conferir com consumo", async () => {
  for (const st of ["AGENDADA", "CONFIRMADA"] as const) {
    const cir = await cirurgia(st);
    const v = await valeEnviado(cir.id);
    await conferir(v, 2);
    assert.equal(await statusDe(cir.id), "REALIZADA");
    assert.deepEqual((await consumosDe(cir.id)).map((c) => [c.loteId, c.quantidade]), [[v.l.id, 2]]);
    assert.equal(await saldoDe(v.l.id, localHosp), 3);
    await conferirKardex(v.l.id);
  }
});

test("rota do vale: cirurgia já REALIZADA continua REALIZADA e acumula consumo", async () => {
  const cir = await cirurgia("AGENDADA");
  const v = await valeEnviado(cir.id);
  await db.cirurgia.update({ where: { id: cir.id }, data: { status: "REALIZADA" } });
  await conferir(v, 5);
  assert.equal(await statusDe(cir.id), "REALIZADA");
  assert.equal((await consumosDe(cir.id)).length, 1);
});

test("regra única: a rota do vale recusa consumo em cirurgia cancelada/faturada (antes aceitava: D5) e faz rollback", async () => {
  for (const st of ["CANCELADA", "FATURADA"] as const) {
    const cir = await cirurgia("AGENDADA");
    const v = await valeEnviado(cir.id);
    await db.cirurgia.update({ where: { id: cir.id }, data: { status: st } });
    await assert.rejects(conferir(v, 1), new RegExp(`cirurgia ${st.toLowerCase()}`));
    assert.equal(await statusDe(cir.id), st);
    assert.equal((await consumosDe(cir.id)).length, 0);
    assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: v.r.id } })).status, "ENVIADA");
    await conferir(v, 0).catch(() => {}); // sem consumo nada é registrado na cirurgia
  }
});

test("rota do vale: conferir sem consumo não altera o status da cirurgia", async () => {
  const cir = await cirurgia("CONFIRMADA");
  const v = await valeEnviado(cir.id);
  await conferir(v, 0);
  assert.equal(await statusDe(cir.id), "CONFIRMADA");
  assert.equal((await consumosDe(cir.id)).length, 0);
});

/** Rota direta: estoca no depósito, manda 5 ao hospital e devolve o lote. */
async function loteNoHospital() {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  await db.$transaction(async (t) => {
    await movimentar(t, { tipo: "ENTRADA", produtoId: p.id, loteId: l.id, quantidade: 10, destinoId: LOCAIS.DEPOSITO, custoUnit: 10 });
    await movimentar(t, { tipo: "REMESSA", produtoId: p.id, loteId: l.id, quantidade: 5, origemId: LOCAIS.DEPOSITO, destinoId: localHosp, custoUnit: 10 });
  });
  return { p, l };
}
const direto = (cirurgiaId: string, loteId: string, quantidade: number) =>
  db.$transaction((t) => registrarConsumoDiretoTx(t, { cirurgiaId, loteId, quantidade, usuario: "teste" }));

test("rota direta: AGENDADA/CONFIRMADA viram REALIZADA, baixa o hospital; REALIZADA permanece; estorno volta a CONFIRMADA", async () => {
  for (const st of ["AGENDADA", "CONFIRMADA"] as const) {
    const cir = await cirurgia(st);
    const { l } = await loteNoHospital();
    await direto(cir.id, l.id, 2);
    assert.equal(await statusDe(cir.id), "REALIZADA");
    assert.equal(await saldoDe(l.id, localHosp), 3);
    await direto(cir.id, l.id, 1);
    assert.equal(await statusDe(cir.id), "REALIZADA");
    const consumos = await consumosDe(cir.id);
    assert.equal(consumos.length, 2);
    for (const c of consumos) await db.$transaction((t) => removerConsumoTx(t, c.id, "teste"));
    assert.equal(await saldoDe(l.id, localHosp), 5);
    assert.equal(await statusDe(cir.id), "CONFIRMADA");
    await conferirKardex(l.id);
  }
});

test("rota direta: FATURADA/CANCELADA, lote bloqueado, lote vencido e saldo insuficiente são recusados sem efeito", async () => {
  const { l } = await loteNoHospital();
  for (const st of ["CANCELADA", "FATURADA"] as const) {
    const cir = await cirurgia(st);
    await assert.rejects(direto(cir.id, l.id, 1), new RegExp(`cirurgia ${st.toLowerCase()}`));
    assert.equal((await consumosDe(cir.id)).length, 0);
  }
  const cir = await cirurgia("AGENDADA");
  await assert.rejects(direto(cir.id, l.id, 6), /saldo|insuficiente/i);
  await db.lote.update({ where: { id: l.id }, data: { status: "BLOQUEADO" } });
  await assert.rejects(direto(cir.id, l.id, 1), /não está liberado/);
  await db.lote.update({ where: { id: l.id }, data: { status: "LIBERADO", validade: dia(-1) } });
  await assert.rejects(direto(cir.id, l.id, 1), /vencido/);
  await assert.rejects(direto("inexistente", l.id, 1), /Cirurgia não encontrada/);
  assert.equal(await statusDe(cir.id), "AGENDADA");
  assert.equal(await saldoDe(l.id, localHosp), 5);
});

test("remover consumo de cirurgia faturada/cancelada é recusado", async () => {
  const cir = await cirurgia("AGENDADA");
  const { l } = await loteNoHospital();
  await direto(cir.id, l.id, 1);
  const [c] = await consumosDe(cir.id);
  await db.cirurgia.update({ where: { id: cir.id }, data: { status: "FATURADA" } });
  await assert.rejects(db.$transaction((t) => removerConsumoTx(t, c.id, "teste")), /consumo não pode ser removido/);
});

// Varredura funcional (REVISAO §20): faturar e registrar consumo AO MESMO TEMPO. Sem trava na cirurgia, o faturamento
// lia o consumo antigo e o novo consumo baixava o estoque mas ficava fora do pedido (e não podia mais ser estornado).
test("concorrência: faturar × consumo direto em paralelo — o consumo entra no pedido ou é recusado, nunca fica de fora", async () => {
  const { faturarCirurgia } = await import("@/app/(app)/comercial/_lib/faturamento");
  for (let rodada = 0; rodada < 3; rodada++) {
    const cir = await cirurgia("CONFIRMADA");
    const v = await valeEnviado(cir.id);
    await conferir(v, 1); // REALIZADA com 1 consumido; 4 continuam consignadas
    const [fat, cons] = await Promise.allSettled([
      db.$transaction((t) => faturarCirurgia(t, cir.id)),
      db.$transaction((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: v.l.id, quantidade: 2, usuario: "teste" })),
    ]);
    assert.equal(fat.status, "fulfilled", String((fat as PromiseRejectedResult).reason));
    const consumido = (await consumosDe(cir.id)).reduce((s, c) => s + c.quantidade, 0);
    const pedido = await db.pedidoVenda.findUniqueOrThrow({ where: { cirurgiaId: cir.id }, include: { itens: true } });
    const noPedido = pedido.itens.reduce((s, i) => s + i.quantidade, 0);
    assert.equal(noPedido, consumido, "todo consumo registrado tem de estar no pedido");
    if (cons.status === "rejected") assert.match(String(cons.reason), /faturada/);
    assert.equal(await saldoDe(v.l.id, localHosp), 5 - consumido);
    await conferirKardex(v.l.id);
  }
});
