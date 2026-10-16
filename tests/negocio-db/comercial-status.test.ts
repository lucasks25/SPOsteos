/** Comercial: transições de status da cirurgia, cancelamento de pedido de venda e status do orçamento. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { faturarCirurgia } from "@/app/(app)/comercial/_lib/faturamento";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { cancelarPedidoVendaTx } from "@/app/(app)/comercial/_lib/pedido-servico";
import { HospitalTravadoError, cancelarCirurgiaTx, confirmarCirurgiaTx, salvarCirurgiaTx } from "@/app/(app)/comercial/_lib/cirurgia-servico";
import { mudarStatusOrcamentoTx } from "@/app/(app)/comercial/_lib/orcamento-servico";
import { dia, limparTudo, mkHospital, mkLote, mkProduto, num, P, uid } from "./_util";

let medicoId: string, hospitalId: string;
const limpar = async () => {
  await db.orcamento.deleteMany({ where: { paciente: { startsWith: P } } }); // itens em cascata
  await limparTudo();
};
before(async () => {
  await limpar();
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  hospitalId = (await mkHospital()).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

type Status = "AGENDADA" | "CONFIRMADA" | "REALIZADA" | "FATURADA" | "CANCELADA";
const cirurgia = (status: Status = "AGENDADA") => db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente`, status } });
const statusDe = async (id: string) => (await db.cirurgia.findUniqueOrThrow({ where: { id } })).status;
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

async function cirurgiaComConsumo() {
  const p = await mkProduto({ custoMedio: 10, precoBase: 50 });
  const l = await mkLote(p.id);
  const c = await cirurgia("REALIZADA");
  await db.cirurgiaConsumo.create({ data: { cirurgiaId: c.id, produtoId: p.id, loteId: l.id, quantidade: 2 } });
  return c;
}

test("confirmar: só AGENDADA vira CONFIRMADA", async () => {
  const c = await cirurgia();
  await tx((t) => confirmarCirurgiaTx(t, c.id));
  assert.equal(await statusDe(c.id), "CONFIRMADA");
  await assert.rejects(tx((t) => confirmarCirurgiaTx(t, c.id)), /Apenas cirurgias agendadas/);
  await assert.rejects(tx((t) => confirmarCirurgiaTx(t, "nao-existe")), /não encontrada/);
});

test("cancelar: recusa FATURADA, CANCELADA, com consumo e com pedido ativo; aceita AGENDADA/CONFIRMADA", async () => {
  const a = await cirurgia("CONFIRMADA");
  await tx((t) => cancelarCirurgiaTx(t, a.id));
  assert.equal(await statusDe(a.id), "CANCELADA");
  await assert.rejects(tx((t) => cancelarCirurgiaTx(t, a.id)), /já está cancelada/);
  const f = await cirurgia("FATURADA");
  await assert.rejects(tx((t) => cancelarCirurgiaTx(t, f.id)), /já está faturada/);
  const comConsumo = await cirurgiaComConsumo();
  await assert.rejects(tx((t) => cancelarCirurgiaTx(t, comConsumo.id)), /Remova o consumo/);
  await assert.rejects(tx((t) => cancelarCirurgiaTx(t, "nao-existe")), /não encontrada/);

  const comPedido = await cirurgiaComConsumo();
  const pv = await tx((t) => faturarCirurgia(t, comPedido.id));
  await db.cirurgiaConsumo.deleteMany({ where: { cirurgiaId: comPedido.id } });
  await db.cirurgia.update({ where: { id: comPedido.id }, data: { status: "REALIZADA" } });
  await assert.rejects(tx((t) => cancelarCirurgiaTx(t, comPedido.id)), /pedido de venda vinculado/);
  await db.pedidoVenda.update({ where: { id: pv.id }, data: { status: "CANCELADO" } });
  await tx((t) => cancelarCirurgiaTx(t, comPedido.id)); // pedido cancelado não impede
  assert.equal(await statusDe(comPedido.id), "CANCELADA");
});

test("salvar: cria; edita; recusa FATURADA/CANCELADA e troca de hospital com consumo", async () => {
  const base = { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} salvar`, sus: false };
  const { cirurgia: c, criada } = await tx((t) => salvarCirurgiaTx(t, null, base));
  assert.equal(criada, true);
  const ed = await tx((t) => salvarCirurgiaTx(t, c.id, { ...base, paciente: `${P} editado` }));
  assert.equal(ed.criada, false);
  assert.equal(ed.cirurgia.paciente, `${P} editado`);

  const outro = (await mkHospital()).id;
  await db.cirurgiaConsumo.create({ data: { cirurgiaId: c.id, produtoId: (await mkProduto()).id, loteId: (await mkLote((await mkProduto()).id)).id, quantidade: 1 } });
  await assert.rejects(tx((t) => salvarCirurgiaTx(t, c.id, { ...base, hospitalId: outro })), HospitalTravadoError);
  await db.cirurgiaConsumo.deleteMany({ where: { cirurgiaId: c.id } });
  const trocada = await tx((t) => salvarCirurgiaTx(t, c.id, { ...base, hospitalId: outro }));
  assert.equal(trocada.cirurgia.hospitalId, outro);

  for (const st of ["FATURADA", "CANCELADA"] as const) {
    await db.cirurgia.update({ where: { id: c.id }, data: { status: st } });
    await assert.rejects(tx((t) => salvarCirurgiaTx(t, c.id, base)), /não pode ser editada/);
  }
  await assert.rejects(tx((t) => salvarCirurgiaTx(t, "nao-existe", base)), /não encontrada/);
});

test("cancelar pedido: ABERTO vira CANCELADO e a cirurgia FATURADA volta a REALIZADA e pode ser faturada de novo", async () => {
  const c = await cirurgiaComConsumo();
  const pv = await tx((t) => faturarCirurgia(t, c.id));
  assert.equal(await statusDe(c.id), "FATURADA");
  const r = await tx((t) => cancelarPedidoVendaTx(t, pv.id));
  assert.equal(num(r.total), num(pv.total));
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv.id } })).status, "CANCELADO");
  assert.equal(await statusDe(c.id), "REALIZADA");
  const novo = await tx((t) => faturarCirurgia(t, c.id));
  assert.notEqual(novo.id, pv.id);
  assert.equal(await statusDe(c.id), "FATURADA");
});

test("cancelar pedido: recusa pedido já cancelado, faturado (com NF) e inexistente", async () => {
  const c = await cirurgiaComConsumo();
  const pv = await tx((t) => faturarCirurgia(t, c.id));
  await tx((t) => cancelarPedidoVendaTx(t, pv.id));
  await assert.rejects(tx((t) => cancelarPedidoVendaTx(t, pv.id)), /Só é possível cancelar pedidos em aberto/);

  const c2 = await cirurgiaComConsumo();
  const pv2 = await tx((t) => faturarCirurgia(t, c2.id));
  await tx((t) => registrarNfTx(t, pv2.id, `NF${uid()}`, dia(30)));
  await assert.rejects(tx((t) => cancelarPedidoVendaTx(t, pv2.id)), /Só é possível cancelar pedidos em aberto/);
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv2.id } })).status, "FATURADO");
  assert.equal(await statusDe(c2.id), "FATURADA");
  await assert.rejects(tx((t) => cancelarPedidoVendaTx(t, 999999999)), /Só é possível cancelar pedidos em aberto/);
});

test("orçamento: transições válidas e inválidas; enviar exige item", async () => {
  const o = await db.orcamento.create({ data: { hospitalId, paciente: `${P} orc` } });
  const muda = (s: "RASCUNHO" | "ENVIADO" | "APROVADO" | "RECUSADO") => tx((t) => mudarStatusOrcamentoTx(t, o.id, s));
  const status = async () => (await db.orcamento.findUniqueOrThrow({ where: { id: o.id } })).status;
  await assert.rejects(muda("ENVIADO"), /ao menos um item/);
  await assert.rejects(muda("APROVADO"), /Não é possível passar de RASCUNHO para APROVADO/);
  await db.orcamentoItem.create({ data: { orcamentoId: o.id, produtoId: (await mkProduto()).id, quantidade: 1, precoUnit: 10 } });
  await muda("ENVIADO");
  assert.equal(await status(), "ENVIADO");
  await muda("RASCUNHO");
  await muda("ENVIADO");
  await muda("RECUSADO");
  await assert.rejects(muda("APROVADO"), /Não é possível passar de RECUSADO para APROVADO/);
  await muda("RASCUNHO");
  await muda("ENVIADO");
  await muda("APROVADO");
  await assert.rejects(muda("RASCUNHO"), /Não é possível passar de APROVADO para RASCUNHO/);
});
