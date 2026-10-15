/** Faturamento: pedido de venda a partir da cirurgia (preço de tabela, margem, comissão) e NF → conta a receber. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { faturarCirurgia } from "@/app/(app)/comercial/_lib/faturamento";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { tabelaVigente } from "@/app/(app)/comercial/_lib/precos";
import { dia, limparTudo, mkHospital, mkLote, mkProduto, num, P, uid } from "./_util";

let medicoId: string, repId: string, tabelaId: string;
before(async () => {
  await limparTudo();
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  repId = (await db.representante.create({ data: { nome: `${P} rep`, comissaoPercent: 7.5 } })).id;
  tabelaId = (await db.tabelaPreco.create({ data: { nome: `${P} tabela`, vigenciaInicio: dia(-30), vigenciaFim: dia(30) } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const faturar = (id: string) => db.$transaction((tx) => faturarCirurgia(tx, id));

async function cenario(o: { tabela?: boolean; rep?: boolean } = {}) {
  const hosp = await mkHospital({ tabelaPrecoId: o.tabela === false ? undefined : tabelaId });
  const a = await mkProduto({ custoMedio: 100, precoBase: 500 });
  const b = await mkProduto({ custoMedio: 40, precoBase: 90 });
  const la = await mkLote(a.id);
  const lb = await mkLote(b.id);
  await db.tabelaPrecoItem.create({ data: { tabelaId, produtoId: a.id, preco: 300.55 } }); // só o produto A tem preço de tabela
  const cir = await db.cirurgia.create({
    data: {
      dataHora: new Date(), hospitalId: hosp.id, medicoId, paciente: `${P} paciente`, status: "REALIZADA", representanteId: o.rep === false ? undefined : repId,
      consumos: { create: [
        { produtoId: a.id, loteId: la.id, quantidade: 2 },
        { produtoId: a.id, loteId: la.id, quantidade: 1 }, // mesma linha: deve agrupar
        { produtoId: b.id, loteId: lb.id, quantidade: 3 },
      ] },
    },
  });
  return { hosp, a, b, cir };
}

test("pedido de venda: preço da tabela (A) e preço base (B), agrupa por lote, custo médio, margem e comissão do representante", async () => {
  const { cir, a, b, hosp } = await cenario();
  const pv = await faturar(cir.id);
  // A: 3 x 300,55 = 901,65 ; B: 3 x 90 = 270 (sem item na tabela → preço base)
  assert.equal(num(pv.total), 1171.65);
  assert.equal(num(pv.custoTotal), 3 * 100 + 3 * 40); // 420
  assert.equal(num(pv.comissao), 87.87); // 7,5% de 1171,65 = 87,87375
  assert.equal(Math.round((num(pv.total) - num(pv.custoTotal)) * 100) / 100, 751.65); // margem bruta
  assert.equal(pv.status, "ABERTO");
  assert.equal(pv.hospitalId, hosp.id);
  assert.equal(pv.representanteId, repId);
  const itens = await db.pedidoVendaItem.findMany({ where: { pedidoId: pv.id } });
  assert.equal(itens.length, 2);
  const ia = itens.find((i) => i.produtoId === a.id)!, ib = itens.find((i) => i.produtoId === b.id)!;
  assert.deepEqual([ia.quantidade, num(ia.precoUnit), num(ia.custoUnit)], [3, 300.55, 100]);
  assert.deepEqual([ib.quantidade, num(ib.precoUnit), num(ib.custoUnit)], [3, 90, 40]);
  assert.equal((await db.cirurgia.findUniqueOrThrow({ where: { id: cir.id } })).status, "FATURADA");
});

test("sem representante a comissão é zero; hospital sem tabela usa preço base", async () => {
  const { cir } = await cenario({ tabela: false, rep: false });
  const pv = await faturar(cir.id);
  assert.equal(num(pv.total), 3 * 500 + 3 * 90);
  assert.equal(num(pv.comissao), 0);
});

test("tabela fora da vigência na data da cirurgia não é usada", async () => {
  assert.equal(tabelaVigente({ vigenciaInicio: dia(1), vigenciaFim: null }), false);
  assert.equal(tabelaVigente({ vigenciaInicio: null, vigenciaFim: dia(-1) }), false);
  assert.equal(tabelaVigente({ vigenciaInicio: null, vigenciaFim: dia(0) }), true); // vale até o fim do dia
  const { cir } = await cenario();
  await db.cirurgia.update({ where: { id: cir.id }, data: { dataHora: dia(-90) } }); // antes do início da vigência
  const pv = await faturar(cir.id);
  assert.equal(num(pv.total), 3 * 500 + 3 * 90);
});

test("não fatura duas vezes; só REALIZADA com consumo; pedido cancelado libera novo faturamento", async () => {
  const { cir } = await cenario();
  const pv = await faturar(cir.id);
  await assert.rejects(faturar(cir.id), /REALIZADA/); // já virou FATURADA
  await db.cirurgia.update({ where: { id: cir.id }, data: { status: "REALIZADA" } });
  await assert.rejects(faturar(cir.id), new RegExp(`PV-${pv.id}`)); // pedido ainda ativo
  assert.equal(await db.pedidoVenda.count({ where: { cirurgiaId: cir.id } }), 1);

  await db.pedidoVenda.update({ where: { id: pv.id }, data: { status: "CANCELADO" } });
  const novo = await faturar(cir.id);
  assert.notEqual(novo.id, pv.id);
  assert.equal(await db.pedidoVenda.count({ where: { cirurgiaId: cir.id } }), 1);

  const sem = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId: (await mkHospital()).id, medicoId, paciente: `${P} s`, status: "REALIZADA" } });
  await assert.rejects(faturar(sem.id), /não possui consumo/);
  const ag = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId: (await mkHospital()).id, medicoId, paciente: `${P} a` } });
  await assert.rejects(faturar(ag.id), /REALIZADA/);
  await assert.rejects(faturar("nao-existe"), /não encontrada/);
});

test("faturamento concorrente da mesma cirurgia gera um único pedido", async () => {
  const { cir } = await cenario();
  const r = await Promise.allSettled([faturar(cir.id), faturar(cir.id)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.pedidoVenda.count({ where: { cirurgiaId: cir.id } }), 1);
});

test("registrar NF: pedido vira FATURADO, nasce a conta a receber (RECEITA_VENDA, competência em Brasília) e não fatura duas vezes", async () => {
  const { cir } = await cenario();
  const pv = await faturar(cir.id);
  const venc = dia(30);
  // 31/10 às 23h30 em Brasília = 01/11 02:30 UTC: a competência tem de ser 31/10
  const cr = await db.$transaction((tx) => registrarNfTx(tx, pv.id, "NF-TESTE-1", venc, new Date("2026-11-01T02:30:00Z")));
  assert.equal(cr.competencia.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(num(cr.valor), 1171.65);
  assert.equal(cr.pedidoId, pv.id);
  const plano = await db.planoConta.findUniqueOrThrow({ where: { id: cr.planoContaId! } });
  assert.equal(plano.chaveSistema, "RECEITA_VENDA");
  const ped = await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv.id } });
  assert.equal(ped.status, "FATURADO");
  assert.equal(ped.numeroNf, "NF-TESTE-1");
  await assert.rejects(db.$transaction((tx) => registrarNfTx(tx, pv.id, "NF-TESTE-2", venc)), /pedidos abertos/);
  assert.equal(await db.contaReceber.count({ where: { pedidoId: pv.id } }), 1);
});
