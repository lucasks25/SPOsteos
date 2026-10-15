/** Remessa em consignação: FEFO, envio, conferência (retorno/consumo), cancelamento e travas. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { sugerirFefo } from "@/app/(app)/estoque/_lib/fefo";
import { cancelarRemessa, conferirRemessa, criarRemessa, enviarRemessa, lotesDisponiveis } from "@/app/(app)/estoque/_lib/remessas";
import { conferirKardex, limparTudo, mkHospital, mkLote, mkProduto, P, saldoDe, uid } from "./_util";

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

const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
const estocar = (produtoId: string, loteId: string, q: number) =>
  tx((t) => movimentar(t, { tipo: "ENTRADA", produtoId, loteId, quantidade: q, destinoId: LOCAIS.DEPOSITO, custoUnit: 10 }));
const criar = (itens: { produtoId: string; loteId: string; quantidade: number }[], extra: { cirurgiaId?: string } = {}) =>
  tx((t) => criarRemessa(t, { hospitalId, itens, ...extra }));
const enviar = (id: number) => tx((t) => enviarRemessa(t, id, "teste"));
const conferir = (id: number, r: { itemId: string; devolvido: number; consumido: number }[]) => tx((t) => conferirRemessa(t, id, r, "teste"));
const itensDe = (id: number) => db.remessaItem.findMany({ where: { remessaId: id } });
const cirurgia = (status: "REALIZADA" | "AGENDADA" = "AGENDADA") =>
  db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente`, status } });

test("FEFO: lotes disponíveis vêm ordenados por validade; a sugestão consome o que vence primeiro e divide entre lotes", async () => {
  const p = await mkProduto();
  const tarde = await mkLote(p.id, { validadeDias: 400, numero: "Z-TARDE" });
  const cedo = await mkLote(p.id, { validadeDias: 30, numero: "A-CEDO" });
  const meio = await mkLote(p.id, { validadeDias: 200, numero: "M-MEIO" });
  const vencido = await mkLote(p.id, { validadeDias: -5, numero: "VENCIDO" });
  const quarentena = await mkLote(p.id, { validadeDias: 10, status: "QUARENTENA", numero: "QUARENTENA" });
  for (const [l, q] of [[tarde, 10], [cedo, 3], [meio, 10], [vencido, 10], [quarentena, 10]] as const) await estocar(p.id, l.id, q);

  const disp = await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] }));
  assert.deepEqual(disp.map((l) => l.numero), ["A-CEDO", "M-MEIO", "Z-TARDE"]); // sem vencido nem quarentena

  const s = sugerirFefo(disp, p.id, 5);
  assert.deepEqual(s.linhas.map((l) => [l.loteId, l.quantidade]), [[cedo.id, 3], [meio.id, 2]]);
  assert.equal(s.faltante, 0);
  assert.equal(sugerirFefo(disp, p.id, 100).faltante, 100 - 23);
});

test("reserva: remessa ABERTA reduz o disponível; excesso, lote em quarentena e lote vencido são recusados", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 5);
  await criar([{ produtoId: p.id, loteId: l.id, quantidade: 3 }]);
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] })))[0].disponivel, 2);
  await assert.rejects(criar([{ produtoId: p.id, loteId: l.id, quantidade: 3 }]), /disponível no depósito 2, solicitado 3/);

  const q = await mkLote(p.id, { status: "QUARENTENA" });
  await estocar(p.id, q.id, 5);
  await assert.rejects(criar([{ produtoId: p.id, loteId: q.id, quantidade: 1 }]), /não está liberado/);
  const v = await mkLote(p.id, { validadeDias: -1 });
  await estocar(p.id, v.id, 5);
  await assert.rejects(criar([{ produtoId: p.id, loteId: v.id, quantidade: 1 }]), /vencido/);
  await assert.rejects(criar([]), /ao menos um item/);
});

test("enviar → conferir: devolvido volta ao depósito, consumido sai, o resto fica consignado; saldos == kardex", async () => {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 10);
  const cir = await cirurgia();
  const r = await criar([{ produtoId: p.id, loteId: l.id, quantidade: 8 }], { cirurgiaId: cir.id });
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 10); // criar não movimenta
  await enviar(r.id);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 2);
  assert.equal(await saldoDe(l.id, localHosp), 8);
  await assert.rejects(enviar(r.id), /não está aberta/); // duplo envio

  const [item] = await itensDe(r.id);
  await assert.rejects(conferir(r.id, [{ itemId: item.id, devolvido: 5, consumido: 4 }]), /excede o enviado/);
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: r.id } })).status, "ENVIADA"); // rollback do status
  await conferir(r.id, [{ itemId: item.id, devolvido: 3, consumido: 4 }]);

  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 5); // 2 + 3
  assert.equal(await saldoDe(l.id, localHosp), 1); // 8 - 3 - 4 permanece consignado
  const [it2] = await itensDe(r.id);
  assert.deepEqual([it2.devolvido, it2.consumido], [3, 4]);
  const consumos = await db.cirurgiaConsumo.findMany({ where: { cirurgiaId: cir.id } });
  assert.deepEqual(consumos.map((c) => [c.loteId, c.quantidade]), [[l.id, 4]]);
  assert.equal((await db.cirurgia.findUniqueOrThrow({ where: { id: cir.id } })).status, "REALIZADA");
  const kardex = await db.movimento.findMany({ where: { loteId: l.id, tipo: { in: ["REMESSA", "RETORNO", "CONSUMO"] } }, orderBy: { criadoEm: "asc" } });
  assert.deepEqual(kardex.map((m) => [m.tipo, m.quantidade]).sort(), [["CONSUMO", 4], ["REMESSA", 8], ["RETORNO", 3]]);
  assert.equal(kardex.find((m) => m.tipo === "CONSUMO")?.documento, `CIR-${cir.numero}`);
  await assert.rejects(conferir(r.id, []), /não está enviada/); // conferir duas vezes
  await conferirKardex(l.id);
});

test("conferir sem informar o item = nada devolvido nem consumido: tudo permanece consignado", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 4);
  const r = await criar([{ produtoId: p.id, loteId: l.id, quantidade: 4 }]);
  await enviar(r.id);
  await conferir(r.id, []);
  assert.equal(await saldoDe(l.id, localHosp), 4);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 0);
  await conferirKardex(l.id);
});

test("cancelar: ABERTA libera a reserva sem mexer no estoque; ENVIADA não pode ser cancelada", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 6);
  const a = await criar([{ produtoId: p.id, loteId: l.id, quantidade: 6 }]);
  await tx((t) => cancelarRemessa(t, a.id));
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: a.id } })).status, "CANCELADA");
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 6);
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] })))[0].disponivel, 6);
  await assert.rejects(enviar(a.id), /não está aberta/); // cancelada não envia
  await assert.rejects(tx((t) => cancelarRemessa(t, a.id)), /não está aberta/);

  const b = await criar([{ produtoId: p.id, loteId: l.id, quantidade: 2 }]);
  await enviar(b.id);
  await assert.rejects(tx((t) => cancelarRemessa(t, b.id)), /não está aberta/);
  assert.equal(await saldoDe(l.id, localHosp), 2);
  await conferirKardex(l.id);
});

test("enviar remessa cujo estoque sumiu depois da criação é recusado e não deixa a remessa ENVIADA", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 3);
  const r = await criar([{ produtoId: p.id, loteId: l.id, quantidade: 3 }]);
  await tx((t) => movimentar(t, { tipo: "PERDA", produtoId: p.id, loteId: l.id, quantidade: 2, origemId: LOCAIS.DEPOSITO }));
  await assert.rejects(enviar(r.id), /Saldo insuficiente/);
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: r.id } })).status, "ABERTA");
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 1);
});

test("cirurgia de outro hospital ou já faturada/cancelada é recusada na remessa", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await estocar(p.id, l.id, 2);
  const outro = await mkHospital();
  const cOutro = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId: outro.id, medicoId, paciente: `${P} x` } });
  await assert.rejects(criar([{ produtoId: p.id, loteId: l.id, quantidade: 1 }], { cirurgiaId: cOutro.id }), /outro hospital/);
  const cFat = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} y`, status: "FATURADA" } });
  await assert.rejects(criar([{ produtoId: p.id, loteId: l.id, quantidade: 1 }], { cirurgiaId: cFat.id }), /faturada/);
});
