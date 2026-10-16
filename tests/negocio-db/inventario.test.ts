/** Inventário de consignado: foto, contagem, resoluções, recálculo no fechamento, imutabilidade e concorrência. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { conferirRemessa, criarRemessa, enviarRemessa } from "@/app/(app)/estoque/_lib/remessas";
import {
  cancelarInventario,
  concluirContagem,
  criarInventario,
  docInventario,
  fecharInventario,
  incluirLoteEncontrado,
  salvarContagem,
  type ResolucaoInput,
} from "@/app/(app)/estoque/_lib/inventario-servico";
import { conferirKardex, limparTudo, mkHospital, mkLote, mkProduto, saldoDe } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

/** Hospital novo + produto (custo 10) + um lote por quantidade informada, já consignados. */
async function cenario(qtds: number[]) {
  const hospital = await mkHospital();
  const localId = await tx((t) => localDoHospital(t, hospital.id));
  const p = await mkProduto({ custoMedio: 10 });
  const lotes = [];
  for (const q of qtds) {
    const l = await mkLote(p.id);
    await tx((t) => movimentar(t, { tipo: "REMESSA", produtoId: p.id, loteId: l.id, quantidade: q, destinoId: localId, custoUnit: 10 }));
    lotes.push(l);
  }
  return { hospital, localId, p, lotes };
}
const criar = (hospitalId: string) => tx((t) => criarInventario(t, { hospitalId, usuario: "teste" }));
const itemDe = (invId: number, loteId: string) => db.inventarioConsignacaoItem.findUniqueOrThrow({ where: { inventarioId_loteId: { inventarioId: invId, loteId } } });
const contar = async (invId: number, pares: [string, number | null][]) => {
  const itens = await db.inventarioConsignacaoItem.findMany({ where: { inventarioId: invId } });
  const porLote = new Map(itens.map((i) => [i.loteId, i.id]));
  await tx((t) => salvarContagem(t, invId, pares.map(([loteId, contado]) => ({ itemId: porLote.get(loteId)!, contado }))));
};
const resolver = async (invId: number, mapa: Record<string, { resolucao: ResolucaoInput["resolucao"]; justificativa?: string }>) => {
  const itens = await db.inventarioConsignacaoItem.findMany({ where: { inventarioId: invId } });
  return itens.filter((i) => mapa[i.loteId]).map((i) => ({ itemId: i.id, ...mapa[i.loteId] }));
};
const fechar = (invId: number, r: ResolucaoInput[]) => tx((t) => fecharInventario(t, invId, r, "teste"));

test("foto do saldo: um item por lote com saldo, custo médio congelado; lote sem saldo fica de fora", async () => {
  const c = await cenario([10, 5]);
  const semSaldo = await mkLote(c.p.id);
  const inv = await criar(c.hospital.id);
  const itens = await db.inventarioConsignacaoItem.findMany({ where: { inventarioId: inv.id } });
  assert.equal(itens.length, 2);
  assert.ok(!itens.some((i) => i.loteId === semSaldo.id));
  assert.deepEqual(itens.map((i) => i.saldoSistema).sort((a, b) => a - b), [5, 10]);
  assert.ok(itens.every((i) => Number(i.valorUnit) === 10 && i.contado === null));
  // mudar o custo médio depois não altera o valor congelado
  await db.produto.update({ where: { id: c.p.id }, data: { custoMedio: 99 } });
  assert.equal(Number((await itemDe(inv.id, c.lotes[0].id)).valorUnit), 10);
});

test("fechamento com as três resoluções + lote encontrado: saldo, kardex, valor a cobrar e Saldo == Σ Kardex", async () => {
  const c = await cenario([10, 8, 6, 4]);
  const [A, B, C, D] = c.lotes;
  const E = await mkLote(c.p.id); // lote que não estava no saldo do hospital
  const inv = await criar(c.hospital.id);
  await tx((t) => incluirLoteEncontrado(t, inv.id, { loteId: E.id, contado: 2 }));
  await contar(inv.id, [[A.id, 7], [B.id, 6], [C.id, 5], [D.id, 6]]); // A -3, B -2, C -1, D +2
  await tx((t) => concluirContagem(t, inv.id));
  const doc = docInventario(inv.id);

  const resumo = await fechar(inv.id, await resolver(inv.id, {
    [A.id]: { resolucao: "AJUSTE" },
    [B.id]: { resolucao: "COBRAR_HOSPITAL" },
    [C.id]: { resolucao: "JUSTIFICADA", justificativa: "extraviado no transporte" },
    [D.id]: { resolucao: "AJUSTE" },
    [E.id]: { resolucao: "AJUSTE" },
  }));
  assert.equal(resumo.divergentes, 5);
  assert.equal(resumo.valorFalta, 60); // (3+2+1) × 10
  assert.equal(resumo.valorSobra, 40); // (2+2) × 10

  assert.equal(await saldoDe(A.id, c.localId), 7); // corrigido
  assert.equal(await saldoDe(B.id, c.localId), 6); // corrigido
  assert.equal(await saldoDe(C.id, c.localId), 6); // justificada: não mexe
  assert.equal(await saldoDe(D.id, c.localId), 6);
  assert.equal(await saldoDe(E.id, c.localId), 2);

  const movs = await db.movimento.findMany({ where: { documento: doc } });
  const tipoDe = (loteId: string) => movs.find((m) => m.loteId === loteId)?.tipo;
  assert.equal(tipoDe(A.id), "PERDA");
  assert.equal(tipoDe(B.id), "AJUSTE");
  assert.equal(tipoDe(C.id), undefined);
  assert.equal(tipoDe(D.id), "AJUSTE");
  assert.equal(tipoDe(E.id), "AJUSTE");
  assert.equal(movs.length, 4);

  const iB = await itemDe(inv.id, B.id);
  assert.equal(Number(iB.valorCobrar), 20);
  assert.equal(iB.resolucao, "COBRAR_HOSPITAL");
  assert.equal((await itemDe(inv.id, A.id)).valorCobrar, null);
  const iC = await itemDe(inv.id, C.id);
  assert.equal(iC.justificativa, "extraviado no transporte");
  assert.equal(iC.diferenca, -1);
  const fechado = await db.inventarioConsignacao.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(fechado.status, "FECHADO");
  assert.ok(fechado.fechadoEm && fechado.fechadoPor === "teste");
  // não criou título financeiro
  assert.equal(await db.contaReceber.count({ where: { hospitalId: c.hospital.id } }), 0);

  for (const l of [A, B, C, D, E]) await conferirKardex(l.id);
});

test("recusas no fechamento não deixam rastro: sem resolução, justificada sem texto, cobrar sobra, sem concluir contagem", async () => {
  const c = await cenario([10, 5]);
  const [A, B] = c.lotes;
  const inv = await criar(c.hospital.id);
  await assert.rejects(fechar(inv.id, []), /Conclua a contagem/);
  await assert.rejects(tx((t) => concluirContagem(t, inv.id)), /Faltam 2 item/);
  await contar(inv.id, [[A.id, 8], [B.id, 6]]); // A -2, B +1
  await tx((t) => concluirContagem(t, inv.id));

  await assert.rejects(fechar(inv.id, await resolver(inv.id, { [A.id]: { resolucao: "AJUSTE" } })), /Escolha a resolução/);
  await assert.rejects(fechar(inv.id, await resolver(inv.id, { [A.id]: { resolucao: "JUSTIFICADA", justificativa: "  " }, [B.id]: { resolucao: "AJUSTE" } })), /justificativa/);
  await assert.rejects(fechar(inv.id, await resolver(inv.id, { [A.id]: { resolucao: "AJUSTE" }, [B.id]: { resolucao: "COBRAR_HOSPITAL" } })), /só vale para falta/);

  assert.equal(await saldoDe(A.id, c.localId), 10);
  assert.equal(await saldoDe(B.id, c.localId), 5);
  assert.equal(await db.movimento.count({ where: { documento: docInventario(inv.id) } }), 0);
  assert.equal((await db.inventarioConsignacao.findUniqueOrThrow({ where: { id: inv.id } })).status, "CONTADO");
  await conferirKardex(A.id);
  await conferirKardex(B.id);
});

test("saldo mudou depois da foto: a divergência é recalculada contra o saldo ATUAL e o fechamento guarda os dois", async () => {
  const c = await cenario([10, 10]);
  const [A, B] = c.lotes;
  const inv = await criar(c.hospital.id);
  // depois da foto: A consumiu 4 (saldo 6); B recebeu retorno de 2 (saldo 12)
  await tx((t) => movimentar(t, { tipo: "CONSUMO", produtoId: c.p.id, loteId: A.id, quantidade: 4, origemId: c.localId }));
  await tx((t) => movimentar(t, { tipo: "RETORNO", produtoId: c.p.id, loteId: B.id, quantidade: 2, destinoId: c.localId }));
  await contar(inv.id, [[A.id, 6], [B.id, 10]]); // A confere hoje (contra a foto seria -4); B falta 2 hoje (contra a foto confere)
  await tx((t) => concluirContagem(t, inv.id));

  await fechar(inv.id, await resolver(inv.id, { [B.id]: { resolucao: "AJUSTE" } }));
  const iA = await itemDe(inv.id, A.id);
  assert.deepEqual([iA.saldoSistema, iA.saldoFechamento, iA.diferenca, iA.resolucao], [10, 6, 0, null]);
  const iB = await itemDe(inv.id, B.id);
  assert.deepEqual([iB.saldoSistema, iB.saldoFechamento, iB.diferenca], [10, 12, -2]);
  assert.equal(await saldoDe(A.id, c.localId), 6);
  assert.equal(await saldoDe(B.id, c.localId), 10);
  await conferirKardex(A.id);
  await conferirKardex(B.id);
});

test("fechado é imutável; fechar de novo é recusado; cancelado libera o hospital e também é imutável", async () => {
  const c = await cenario([5]);
  const [A] = c.lotes;
  const inv = await criar(c.hospital.id);
  await assert.rejects(criar(c.hospital.id), /em andamento/); // um por hospital
  await contar(inv.id, [[A.id, 4]]);
  await tx((t) => concluirContagem(t, inv.id));
  const r = await resolver(inv.id, { [A.id]: { resolucao: "AJUSTE" } });
  await fechar(inv.id, r);
  await assert.rejects(fechar(inv.id, r), /já fechado/);
  await assert.rejects(contar(inv.id, [[A.id, 1]]), /já fechado/);
  await assert.rejects(tx((t) => incluirLoteEncontrado(t, inv.id, { loteId: A.id, contado: 1 })), /já fechado/);
  await assert.rejects(tx((t) => cancelarInventario(t, inv.id)), /já fechado/);
  assert.equal(await saldoDe(A.id, c.localId), 4); // ajustado uma única vez
  await conferirKardex(A.id);

  // fechado libera o hospital para um novo; cancelar também
  const inv2 = await criar(c.hospital.id);
  await tx((t) => cancelarInventario(t, inv2.id));
  await assert.rejects(contar(inv2.id, [[A.id, 1]]), /cancelado/);
  await assert.rejects(tx((t) => concluirContagem(t, inv2.id)), /cancelado/);
  const inv3 = await criar(c.hospital.id);
  assert.ok(inv3.id > inv2.id);
  assert.equal(await saldoDe(A.id, c.localId), 4); // cancelar não mexeu em nada
});

test("contagem inválida e apagar contagem em CONTADO volta para ABERTO", async () => {
  const c = await cenario([5]);
  const [A] = c.lotes;
  const inv = await criar(c.hospital.id);
  await assert.rejects(contar(inv.id, [[A.id, -1]]), /inteiro/);
  await assert.rejects(contar(inv.id, [[A.id, 1.5]]), /inteiro/);
  await contar(inv.id, [[A.id, 5]]);
  await tx((t) => concluirContagem(t, inv.id));
  await contar(inv.id, [[A.id, null]]);
  assert.equal((await db.inventarioConsignacao.findUniqueOrThrow({ where: { id: inv.id } })).status, "ABERTO");
  await assert.rejects(tx((t) => incluirLoteEncontrado(t, inv.id, { loteId: A.id, contado: 1 })), /já está no inventário/);
});

test("dois fechamentos simultâneos: só um passa e o ajuste é aplicado uma vez", async () => {
  const c = await cenario([10]);
  const [A] = c.lotes;
  const inv = await criar(c.hospital.id);
  await contar(inv.id, [[A.id, 7]]);
  await tx((t) => concluirContagem(t, inv.id));
  const r = await resolver(inv.id, { [A.id]: { resolucao: "AJUSTE" } });
  const res = await Promise.allSettled([fechar(inv.id, r), fechar(inv.id, r)]);
  assert.equal(res.filter((x) => x.status === "fulfilled").length, 1);
  const rej = res.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rej.reason), /já fechado/);
  assert.equal(await saldoDe(A.id, c.localId), 7);
  assert.equal(await db.movimento.count({ where: { documento: docInventario(inv.id) } }), 1);
  await conferirKardex(A.id);
});

test("travas do banco: contado negativo, justificada sem texto e cobrar sem valor são recusados", async () => {
  const c = await cenario([5]);
  const [A] = c.lotes;
  const inv = await criar(c.hospital.id);
  const item = await itemDe(inv.id, A.id);
  await assert.rejects(db.$executeRaw`UPDATE "InventarioConsignacaoItem" SET "contado" = -1 WHERE id = ${item.id}`, /contado_check|check/i);
  await assert.rejects(db.$executeRaw`UPDATE "InventarioConsignacaoItem" SET "resolucao" = 'JUSTIFICADA'::"ResolucaoInventario" WHERE id = ${item.id}`, /justificativa_check|check/i);
  await assert.rejects(db.$executeRaw`UPDATE "InventarioConsignacaoItem" SET "resolucao" = 'COBRAR_HOSPITAL'::"ResolucaoInventario" WHERE id = ${item.id}`, /cobrar_check|check/i);
  await assert.rejects(db.$executeRaw`UPDATE "InventarioConsignacaoItem" SET "saldoSistema" = -1 WHERE id = ${item.id}`, /check/i);
});

// REVISAO §22 (decisão do coordenador): com inventário em andamento no hospital, enviar ou conferir vale é recusado.
test("inventário em andamento bloqueia enviar e conferir vale do hospital; cancelado, o vale segue", async () => {
  const c = await cenario([2]);
  const l = await mkLote(c.p.id);
  await tx((t) => movimentar(t, { tipo: "ENTRADA", produtoId: c.p.id, loteId: l.id, quantidade: 5, destinoId: LOCAIS.DEPOSITO, custoUnit: 10 }));
  const rem = await tx((t) => criarRemessa(t, { hospitalId: c.hospital.id, itens: [{ produtoId: c.p.id, loteId: l.id, quantidade: 3 }] }));
  const msg = /Há inventário em andamento neste hospital \(INV-\d+\); feche-o ou cancele antes de movimentar consignado\./;

  const inv = await criar(c.hospital.id);
  await assert.rejects(tx((t) => enviarRemessa(t, rem.id, "teste")), msg);
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: rem.id } })).status, "ABERTA", "recusa não deixa rastro");
  await tx((t) => cancelarInventario(t, inv.id));
  await tx((t) => enviarRemessa(t, rem.id, "teste"));

  const inv2 = await criar(c.hospital.id);
  await concluirOuNao(inv2.id);
  const item = await db.remessaItem.findFirstOrThrow({ where: { remessaId: rem.id } });
  await assert.rejects(tx((t) => conferirRemessa(t, rem.id, [{ itemId: item.id, devolvido: 3, consumido: 0 }], "teste")), msg);
  assert.equal(await saldoDe(l.id, c.localId), 3);
  await tx((t) => cancelarInventario(t, inv2.id));
  await tx((t) => conferirRemessa(t, rem.id, [{ itemId: item.id, devolvido: 3, consumido: 0 }], "teste"));
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 5);
  await conferirKardex(l.id);
});

/** Leva o inventário a CONTADO (também "em andamento"). */
async function concluirOuNao(invId: number) {
  const itens = await db.inventarioConsignacaoItem.findMany({ where: { inventarioId: invId } });
  await tx((t) => salvarContagem(t, invId, itens.map((i) => ({ itemId: i.id, contado: i.saldoSistema }))));
  await tx((t) => concluirContagem(t, invId));
  assert.equal((await db.inventarioConsignacao.findUniqueOrThrow({ where: { id: invId } })).status, "CONTADO");
}
