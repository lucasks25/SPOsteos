/** Autorização prévia do convênio: guia com itens, CHECKs, verificação de risco de glosa contra o consumo e pendência do sino. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { carregarPendencias, listarPendencias } from "@/app/(app)/_painel/pendencias";
import { contarCirurgiasSemAutorizacao, excluirAutorizacaoTx, riscoGlosaDaCirurgia, salvarAutorizacaoTx, sugerirItensGuia } from "@/app/(app)/comercial/_lib/autorizacao-servico";
import { dia, limparTudo, mkHospital, mkLote, mkProduto, P, uid } from "./_util";

let medicoId: string, convExige: string, convLivre: string;
before(async () => {
  await limparTudo();
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  convExige = (await db.convenio.create({ data: { nome: `${P} convenio exige` } })).id;
  convLivre = (await db.convenio.create({ data: { nome: `${P} convenio livre`, exigeAutorizacao: false } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const guia = (cirurgiaId: string, o: Partial<Parameters<typeof salvarAutorizacaoTx>[1]> = {}) =>
  db.$transaction((tx) => salvarAutorizacaoTx(tx, { cirurgiaId, status: "SOLICITADA", solicitadaEm: dia(-3), itens: [], ...o }));

async function cenario(o: { convenioId?: string | null; diasAte?: number } = {}) {
  const hosp = await mkHospital();
  const a = await mkProduto();
  const b = await mkProduto();
  const la = await mkLote(a.id);
  const lb = await mkLote(b.id);
  const cir = await db.cirurgia.create({
    data: { dataHora: new Date(Date.now() + (o.diasAte ?? 3) * 86400000), hospitalId: hosp.id, medicoId, paciente: `${P} paciente`, status: "CONFIRMADA", convenioId: o.convenioId === undefined ? convExige : o.convenioId },
  });
  return { cir, a, b, la, lb };
}
const consumir = (cirurgiaId: string, produtoId: string, loteId: string, quantidade: number) => db.cirurgiaConsumo.create({ data: { cirurgiaId, produtoId, loteId, quantidade } });

test("guia com itens: salva, zera autorizado em SOLICITADA/NEGADA, edita substituindo itens e exclui em cascata", async () => {
  const { cir, a, b } = await cenario();
  const g = await guia(cir.id, { numeroGuia: " 123 ", senha: "S9", itens: [{ produtoId: a.id, quantidadeSolicitada: 2, quantidadeAutorizada: 2 }, { produtoId: b.id, quantidadeSolicitada: 1, quantidadeAutorizada: 0 }] });
  assert.equal(g.numeroGuia, "123");
  let itens = await db.autorizacaoItem.findMany({ where: { autorizacaoId: g.id } });
  assert.equal(itens.length, 2);
  assert.ok(itens.every((i) => i.quantidadeAutorizada === 0), "SOLICITADA não autoriza nada");

  await db.$transaction((tx) => salvarAutorizacaoTx(tx, { cirurgiaId: cir.id, status: "PARCIAL", solicitadaEm: dia(-3), autorizadaEm: dia(-1), validade: dia(30), itens: [{ produtoId: a.id, quantidadeSolicitada: 2, quantidadeAutorizada: 1, valorAutorizado: 150.5 }] }, g.id));
  itens = await db.autorizacaoItem.findMany({ where: { autorizacaoId: g.id } });
  assert.deepEqual(itens.map((i) => [i.produtoId, i.quantidadeSolicitada, i.quantidadeAutorizada, Number(i.valorAutorizado)]), [[a.id, 2, 1, 150.5]]);
  assert.equal((await db.autorizacaoConvenio.findUniqueOrThrow({ where: { id: g.id } })).status, "PARCIAL");

  await db.$transaction((tx) => excluirAutorizacaoTx(tx, g.id));
  assert.equal(await db.autorizacaoItem.count({ where: { autorizacaoId: g.id } }), 0);
});

test("validações do serviço", async () => {
  const { cir, a } = await cenario();
  const it = (q = 1, au = 1) => ({ produtoId: a.id, quantidadeSolicitada: q, quantidadeAutorizada: au });
  await assert.rejects(guia(cir.id, { status: "AUTORIZADA", autorizadaEm: dia(-1), itens: [it(1, 0)] }), /ao menos um item/);
  await assert.rejects(guia(cir.id, { status: "AUTORIZADA", itens: [it()] }), /data em que o convênio autorizou/);
  await assert.rejects(guia(cir.id, { itens: [it(), it()] }), /mais de uma vez/);
  await assert.rejects(guia(cir.id, { itens: [it(0)] }), /maior que zero/);
  await assert.rejects(guia(cir.id, { status: "AUTORIZADA", autorizadaEm: dia(-1), itens: [it(1, -1)] }), /igual ou maior que zero/);
  await assert.rejects(guia(cir.id, { validade: dia(-10), solicitadaEm: dia(-3) }), /validade/);
  await db.cirurgia.update({ where: { id: cir.id }, data: { status: "CANCELADA" } });
  await assert.rejects(guia(cir.id), /cancelada/);
  assert.equal(await db.autorizacaoConvenio.count({ where: { cirurgiaId: cir.id } }), 0);
});

test("CHECKs do banco recusam quantidade solicitada zero, autorizada negativa, valor negativo, validade antes da solicitação e recurso sem data", async () => {
  const { cir, a } = await cenario();
  const g = await guia(cir.id);
  const ins = (q: number, au: number, v: string) => db.$executeRawUnsafe(`INSERT INTO "AutorizacaoItem" (id, "autorizacaoId", "produtoId", "quantidadeSolicitada", "quantidadeAutorizada", "valorAutorizado") VALUES ('${P}-${uid()}', '${g.id}', '${a.id}', ${q}, ${au}, ${v})`);
  await assert.rejects(ins(0, 0, "NULL"), /AutorizacaoItem_qtd_solicitada_check|check constraint/);
  await assert.rejects(ins(1, -1, "NULL"), /check constraint/);
  await assert.rejects(ins(1, 0, "-5"), /check constraint/);
  await ins(1, 0, "NULL"); // linha válida passa
  await assert.rejects(db.autorizacaoConvenio.update({ where: { id: g.id }, data: { validade: dia(-30) } }), /check constraint/);
  const hosp = await db.hospital.findFirstOrThrow({ where: { razaoSocial: { startsWith: P } }, select: { id: true } });
  const t = await db.contaReceber.create({ data: { descricao: `${P} t`, valor: 10, vencimento: dia(0), competencia: dia(0), hospitalId: hosp.id } });
  await assert.rejects(db.glosa.create({ data: { contaReceberId: t.id, valor: 1, data: dia(0), motivo: "teste de check", recurso: "EM_RECURSO" } }), /check constraint/);
});

test("risco de glosa lido do banco: consumo agrupado por produto contra os itens autorizados", async () => {
  const { cir, a, b, la, lb } = await cenario();
  assert.deepEqual((await riscoGlosaDaCirurgia(cir.id)).achados.map((x) => x.codigo), ["SEM_AUTORIZACAO"]);

  await guia(cir.id, { status: "AUTORIZADA", autorizadaEm: dia(-1), validade: dia(30), itens: [{ produtoId: a.id, quantidadeSolicitada: 3, quantidadeAutorizada: 3 }, { produtoId: b.id, quantidadeSolicitada: 5, quantidadeAutorizada: 5 }] });
  await consumir(cir.id, a.id, la.id, 2);
  await consumir(cir.id, a.id, la.id, 1);
  await consumir(cir.id, b.id, lb.id, 2);
  let r = await riscoGlosaDaCirurgia(cir.id);
  assert.deepEqual(r.achados.map((x) => `${x.codigo}:${x.produtoId}`), [`AUTORIZADO_NAO_UTILIZADO:${b.id}`]); // A 3/3 ok; B usou 2 de 5
  assert.equal(r.grave, false);

  await consumir(cir.id, a.id, la.id, 1); // A passa a 4 de 3
  r = await riscoGlosaDaCirurgia(cir.id);
  assert.equal(r.grave, true);
  assert.deepEqual(r.achados.map((x) => x.codigo), ["QUANTIDADE_EXCEDIDA", "AUTORIZADO_NAO_UTILIZADO"]);

  const c = await mkProduto();
  await consumir(cir.id, c.id, (await mkLote(c.id)).id, 1);
  assert.ok((await riscoGlosaDaCirurgia(cir.id)).achados.some((x) => x.codigo === "NAO_AUTORIZADO" && x.produtoId === c.id));
});

test("convênio que não exige autorização, ou cirurgia sem convênio, ignora a verificação", async () => {
  for (const convenioId of [convLivre, null]) {
    const { cir, a, la } = await cenario({ convenioId });
    await consumir(cir.id, a.id, la.id, 1);
    assert.deepEqual(await riscoGlosaDaCirurgia(cir.id), { aplicavel: false, achados: [], grave: false });
  }
});

test("itens sugeridos: materiais do procedimento e, onde faltar, o consumo", async () => {
  const { cir, a, b, lb } = await cenario();
  const proc = await db.procedimento.create({ data: { descricao: `${P} procedimento`, itens: { create: [{ produtoId: a.id, quantidade: 4 }] } } });
  await db.cirurgia.update({ where: { id: cir.id }, data: { procedimentoId: proc.id } });
  await consumir(cir.id, b.id, lb.id, 2);
  const s = await sugerirItensGuia(cir.id);
  assert.deepEqual(s.map((x) => [x.produtoId, x.quantidade]).sort(), [[a.id, 4], [b.id, 2]].sort());
});

test("pendência do sino: cirurgia nos próximos 7 dias sem guia autorizada/parcial válida, só para COMERCIAL", async () => {
  const agora = new Date();
  const antes = await contarCirurgiasSemAutorizacao(agora);
  const antesCom = (await carregarPendencias("COMERCIAL")).semAutorizacao;
  const dentro = await cenario({ diasAte: 3 });
  const longe = await cenario({ diasAte: 20 });
  await cenario({ diasAte: 3, convenioId: convLivre });
  assert.equal(await contarCirurgiasSemAutorizacao(agora), antes + 1, "só a de 3 dias com convênio que exige");

  const g = await guia(dentro.cir.id); // solicitada ainda não resolve
  assert.equal(await contarCirurgiasSemAutorizacao(agora), antes + 1);
  await db.$transaction((tx) => salvarAutorizacaoTx(tx, { cirurgiaId: dentro.cir.id, status: "AUTORIZADA", solicitadaEm: dia(-3), autorizadaEm: dia(-1), validade: dia(-1), itens: [{ produtoId: dentro.a.id, quantidadeSolicitada: 1, quantidadeAutorizada: 1 }] }, g.id));
  assert.equal(await contarCirurgiasSemAutorizacao(agora), antes + 1, "validade vencida antes da cirurgia não vale");
  await db.autorizacaoConvenio.update({ where: { id: g.id }, data: { validade: dia(60) } });
  assert.equal(await contarCirurgiasSemAutorizacao(agora), antes);

  const com = await carregarPendencias("COMERCIAL");
  assert.equal(com.semAutorizacao, antesCom);
  assert.equal((await carregarPendencias("ESTOQUE")).semAutorizacao, 0, "estoque não vê");
  assert.equal((await carregarPendencias("FINANCEIRO")).semAutorizacao, 0, "financeiro não vê");
  await guia(longe.cir.id); // fora da janela
  assert.ok(listarPendencias({ ...com, semAutorizacao: 2 }).some((p) => p.key === "aut" && p.qtd === 2));
});
