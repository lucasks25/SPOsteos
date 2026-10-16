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

test("vigência da tabela por dia de Brasília: 21h20 de 15/10 (00h20 UTC de 16/10) ainda é 15/10", () => {
  const ref = new Date("2026-10-16T00:20:00Z");
  const d = (x: string) => new Date(`${x}T00:00:00Z`);
  assert.equal(tabelaVigente({ vigenciaInicio: d("2026-10-16"), vigenciaFim: null }, ref), false); // começa amanhã
  assert.equal(tabelaVigente({ vigenciaInicio: d("2026-10-15"), vigenciaFim: null }, ref), true);
  assert.equal(tabelaVigente({ vigenciaInicio: null, vigenciaFim: d("2026-10-15") }, ref), true); // vale até o fim de hoje
  assert.equal(tabelaVigente({ vigenciaInicio: null, vigenciaFim: d("2026-10-14") }, ref), false);
});

// Varredura funcional (REVISAO §20): item sem preço não pode ir para o pedido (sairia de graça na NF, com CMV e sem receita).
test("faturar recusa produto sem preço (tabela e preço base zerados) e diz o que cadastrar", async () => {
  const { faturarCirurgia } = await import("@/app/(app)/comercial/_lib/faturamento");
  const h = await mkHospital();
  const med = await db.medico.create({ data: { nome: `${P} med`, crm: uid(), ufCrm: "SP" } });
  const semPreco = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(semPreco.id);
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId: h.id, medicoId: med.id, paciente: `${P} pac`, status: "REALIZADA" } });
  await db.cirurgiaConsumo.create({ data: { cirurgiaId: cir.id, produtoId: semPreco.id, loteId: l.id, quantidade: 1 } });
  await assert.rejects(db.$transaction((t) => faturarCirurgia(t, cir.id)), new RegExp(`Sem preço de venda para: ${semPreco.codigo}.*Tabelas de preço`));
  assert.equal((await db.cirurgia.findUniqueOrThrow({ where: { id: cir.id } })).status, "REALIZADA");
  assert.equal(await db.pedidoVenda.count({ where: { cirurgiaId: cir.id } }), 0);
});

// Varredura funcional (REVISAO §20): NF repetida em outro pedido, vencimento antes da NF e edição do título da NF.
test("registrar NF recusa número já usado em outro pedido e vencimento anterior à NF", async () => {
  const numero = `${P}NF${uid()}`;
  const a = await faturar((await cenario()).cir.id);
  const b = await faturar((await cenario()).cir.id);
  await db.$transaction((tx) => registrarNfTx(tx, a.id, numero, dia(30)));
  await assert.rejects(db.$transaction((tx) => registrarNfTx(tx, b.id, ` ${numero} `, dia(30))), new RegExp(`já está registrada no pedido PV-${a.id}`));
  await assert.rejects(db.$transaction((tx) => registrarNfTx(tx, b.id, `${numero}-2`, dia(-1))), /anterior à data da NF/);
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: b.id } })).status, "ABERTO");
});

test("título da NF: valor, competência e hospital não mudam pela edição (DRE = vendas); vencimento e descrição mudam", async () => {
  const { salvarContaReceberTx } = await import("@/app/(app)/financeiro/_lib/titulos-servico");
  const pv = await faturar((await cenario()).cir.id);
  const cr = await db.$transaction((tx) => registrarNfTx(tx, pv.id, `${P}NF${uid()}`, dia(30)));
  const base = { descricao: cr.descricao, hospitalId: cr.hospitalId, planoContaId: cr.planoContaId!, centroCustoId: cr.centroCustoId, competencia: cr.competencia!, valor: num(cr.valor), vencimento: cr.vencimento };
  const salvar = (d: Partial<typeof base>) => db.$transaction((tx) => salvarContaReceberTx(tx, cr.id, { ...base, ...d }));
  await assert.rejects(salvar({ valor: num(cr.valor) - 100 }), /veio da NF do pedido PV-/);
  await assert.rejects(salvar({ competencia: dia(-40) }), /veio da NF/);
  await salvar({ vencimento: dia(45), descricao: `${cr.descricao} (renegociado)` });
  const depois = await db.contaReceber.findUniqueOrThrow({ where: { id: cr.id } });
  assert.equal(num(depois.valor), num(cr.valor));
  assert.equal(depois.vencimento.getTime(), dia(45).getTime());
});
