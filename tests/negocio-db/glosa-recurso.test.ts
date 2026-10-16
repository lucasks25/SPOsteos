/** Glosa por categoria, recurso (reverter reabre o saldo sem apagar o histórico), fechamento de mês e relatório conferido com SQL. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { chaveMes, dreDoMes } from "@/app/(app)/financeiro/_lib/dre";
import { carregarLinhasDre } from "@/app/(app)/financeiro/_lib/dre-dados";
import { addMeses, hojeUTC, inicioMes, ymd } from "@/lib/datas";
import { estornarGlosa, registrarBaixa, registrarGlosa, registrarRecurso } from "@/app/(app)/financeiro/_lib/titulos";
import { glosasDados } from "@/app/(app)/gestao/_lib/consultas";
import { dia, limparTudo, mkHospital, mkProduto, num, P, uid } from "./_util";

const MES_FECHADO = "2025-03";
const DIA_FECHADO = new Date("2025-03-15T00:00:00Z");
let hospitalId: string, contaId: string, medicoId: string, convenioId: string, centroId: string;

async function limpar() {
  await db.lancamento.deleteMany({ where: { OR: [{ conta: { nome: { startsWith: P } } }, { contaReceber: { descricao: { startsWith: P } } }] } });
  await limparTudo();
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: P } } });
  await db.centroCusto.deleteMany({ where: { codigo: "TESTEDBGR" } });
  await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
}
before(async () => {
  await limpar();
  hospitalId = (await mkHospital()).id;
  contaId = (await db.contaBancaria.create({ data: { nome: `${P} conta glosa`, saldoInicial: 0 } })).id;
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  convenioId = (await db.convenio.create({ data: { nome: `${P} convenio` } })).id;
  centroId = (await db.centroCusto.create({ data: { codigo: "TESTEDBGR", nome: "Teste glosa recurso" } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = async (valor: number, o: { pedidoId?: number; competencia?: Date; centro?: boolean } = {}) =>
  db.contaReceber.create({ data: { descricao: `${P} receber`, valor, vencimento: dia(0), competencia: o.competencia ?? dia(0), hospitalId, pedidoId: o.pedidoId, centroCustoId: o.centro ? centroId : undefined, planoContaId: o.centro ? (await db.planoConta.findUniqueOrThrow({ where: { codigo: "1.01" } })).id : undefined } });
const glosar = (id: string, valor: number, categoria?: "SEM_AUTORIZACAO" | "LINEAR" | "TECNICA" | "OUTRA", data = hojeUTC()) =>
  db.$transaction((tx) => registrarGlosa(tx, { tituloId: id, valor, data, motivo: "item não autorizado", categoria }));
const recurso = (id: string, acao: "RECORRER" | "REVERTER" | "MANTER", quando = hojeUTC()) => db.$transaction((tx) => registrarRecurso(tx, id, acao, quando));
const ler = (id: string) => db.contaReceber.findUniqueOrThrow({ where: { id } });
const lerG = (id: string) => db.glosa.findUniqueOrThrow({ where: { id } });

test("categoria é gravada; sem categoria vira OUTRA", async () => {
  const t = await titulo(1000);
  assert.equal((await glosar(t.id, 100, "SEM_AUTORIZACAO")).categoria, "SEM_AUTORIZACAO");
  const g = await glosar(t.id, 50);
  assert.equal(g.categoria, "OUTRA");
  assert.equal(g.recurso, "NENHUM");
  assert.equal(g.recursoEm, null);
});

test("recurso: registrar, manter (saldo igual) e ordem das transições", async () => {
  const t = await titulo(1000);
  const g = await glosar(t.id, 300, "TECNICA");
  await assert.rejects(recurso(g.id, "MANTER"), /Registre primeiro o recurso/);
  await assert.rejects(recurso(g.id, "REVERTER"), /Registre primeiro o recurso/);
  await recurso(g.id, "RECORRER");
  let x = await lerG(g.id);
  assert.deepEqual([x.recurso, x.recursoEm?.getTime()], ["EM_RECURSO", hojeUTC().getTime()]);
  await assert.rejects(recurso(g.id, "RECORRER"), /já teve recurso/);
  await recurso(g.id, "MANTER");
  x = await lerG(g.id);
  assert.equal(x.recurso, "MANTIDA");
  assert.equal(num((await ler(t.id)).valorBaixado), 300, "manter não mexe no saldo");
  await assert.rejects(recurso(g.id, "REVERTER"), /Registre primeiro o recurso/);
  await assert.rejects(recurso("nao-existe", "RECORRER"), /não encontrada/);
});

test("reverter: a glosa deixa de abater o título (reabre), fica no histórico e não pode ser estornada nem revertida de novo", async () => {
  const t = await titulo(1000);
  const g1 = await glosar(t.id, 300, "LINEAR");
  const g2 = await glosar(t.id, 200, "OUTRA");
  await recurso(g1.id, "RECORRER");
  await recurso(g1.id, "REVERTER");
  assert.equal((await lerG(g1.id)).recurso, "REVERTIDA");
  let x = await ler(t.id);
  assert.equal(num(x.valorBaixado), 200, "só a glosa vigente abate");
  assert.equal(x.status, "ABERTO");
  await assert.rejects(db.$transaction((tx) => estornarGlosa(tx, g1.id)), /já foi revertida/);
  await assert.rejects(recurso(g1.id, "REVERTER"), /Registre primeiro o recurso/);
  // o saldo devolvido (800) pode ser recebido normalmente
  await db.$transaction((tx) => registrarBaixa(tx, { tipo: "receber", tituloId: t.id, contaId, data: hojeUTC(), valor: 800 }));
  x = await ler(t.id);
  assert.equal(x.status, "PAGO");
  assert.equal(num(x.valorBaixado), 1000);
  assert.equal(await db.glosa.count({ where: { contaReceberId: t.id } }), 2, "histórico preservado");
  assert.equal((await lerG(g2.id)).recurso, "NENHUM");
});

test("reverter glosa de 100% reabre o título que estava PAGO sem dinheiro", async () => {
  const t = await titulo(500);
  const g = await glosar(t.id, 500, "SEM_AUTORIZACAO");
  assert.equal((await ler(t.id)).status, "PAGO");
  await recurso(g.id, "RECORRER");
  await recurso(g.id, "REVERTER");
  const x = await ler(t.id);
  assert.equal(x.status, "ABERTO");
  assert.equal(x.valorBaixado, null);
  assert.equal(x.valorPago, null);
});

test("DRE ignora a glosa revertida", async () => {
  const hoje = hojeUTC();
  const t = await titulo(2000, { centro: true });
  const g = await glosar(t.id, 250, "TECNICA");
  const dre = async () => dreDoMes(await carregarLinhasDre(inicioMes(hoje), addMeses(inicioMes(hoje), 1), centroId), chaveMes(hoje));
  assert.equal((await dre()).deducoes, -250);
  await recurso(g.id, "RECORRER");
  await recurso(g.id, "REVERTER");
  const d = await dre();
  assert.equal(d.deducoes, 0);
  assert.equal(d.receitaLiquida, 2000);
});

test("fechamento de mês: reverter e estornar na data de mês fechado são recusados; recorrer e manter seguem", async () => {
  const t = await titulo(1000, { competencia: DIA_FECHADO });
  const g = await glosar(t.id, 100, "LINEAR", DIA_FECHADO);
  const g2 = await glosar(t.id, 50, "OUTRA", DIA_FECHADO);
  await recurso(g.id, "RECORRER");
  await recurso(g2.id, "RECORRER");
  await db.fechamentoMes.create({ data: { mes: MES_FECHADO } });
  const fechado = /mês 03\/2025 está fechado/;
  await assert.rejects(recurso(g.id, "REVERTER"), fechado);
  await assert.rejects(glosar(t.id, 10, "OUTRA", DIA_FECHADO), fechado);
  await assert.rejects(db.$transaction((tx) => estornarGlosa(tx, g.id)), fechado);
  assert.equal((await lerG(g.id)).recurso, "EM_RECURSO");
  assert.equal(num((await ler(t.id)).valorBaixado), 150);
  await recurso(g2.id, "MANTER"); // sem efeito financeiro: permitido
  assert.equal((await lerG(g2.id)).recurso, "MANTIDA");
  await db.fechamentoMes.delete({ where: { mes: MES_FECHADO } });
  await recurso(g.id, "REVERTER");
  assert.equal(num((await ler(t.id)).valorBaixado), 50);
});

test("relatório de glosas confere com SQL (valor, categorias, convênio e hospital) e filtra por categoria", async () => {
  await limpar();
  hospitalId = (await mkHospital()).id;
  contaId = (await db.contaBancaria.create({ data: { nome: `${P} conta glosa`, saldoInicial: 0 } })).id;
  convenioId = (await db.convenio.create({ data: { nome: `${P} convenio` } })).id;
  centroId = (await db.centroCusto.create({ data: { codigo: "TESTEDBGR", nome: "Teste glosa recurso" } })).id;
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  const prod = await mkProduto();
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, convenioId, paciente: `${P} paciente`, status: "FATURADA" } });
  const pv = await db.pedidoVenda.create({ data: { hospitalId, cirurgiaId: cir.id, status: "FATURADO", numeroNf: "1", faturadoEm: new Date(), total: 1000.1, itens: { create: [{ produtoId: prod.id, quantidade: 1, precoUnit: 1000.1 }] } } });
  const t1 = await titulo(1000.1, { pedidoId: pv.id });
  const avulso = await titulo(400); // sem pedido: "sem convênio"
  const g1 = await glosar(t1.id, 100.05, "SEM_AUTORIZACAO");
  await glosar(t1.id, 200.2, "LINEAR");
  await glosar(avulso.id, 0.1, "OUTRA");
  await recurso(g1.id, "RECORRER");

  const sp = { de: ymd(dia(-1)), ate: ymd(dia(0)), hospital: hospitalId };
  const r = await glosasDados(sp);
  const sql = await db.$queryRaw<{ total: string; qtd: bigint }[]>`SELECT SUM(g.valor)::text AS total, COUNT(*) AS qtd FROM "Glosa" g JOIN "ContaReceber" c ON c.id = g."contaReceberId" WHERE c."hospitalId" = ${hospitalId} AND g.data BETWEEN ${dia(-1)} AND ${dia(0)}`;
  assert.equal(r.glosado, Number(sql[0].total));
  assert.equal(r.qtd, Number(sql[0].qtd));
  assert.equal(r.glosado, 300.35);
  assert.equal(r.faturado, 1000.1);
  assert.equal(r.pct, 30.03); // 300,35 / 1000,10 = 30,0320%
  assert.deepEqual(r.emRecurso, { valor: 100.05, qtd: 1 });
  const cat = await db.$queryRaw<{ categoria: string; total: string }[]>`SELECT g.categoria::text, SUM(g.valor)::text AS total FROM "Glosa" g JOIN "ContaReceber" c ON c.id = g."contaReceberId" WHERE c."hospitalId" = ${hospitalId} GROUP BY g.categoria`;
  assert.deepEqual(Object.fromEntries(r.porCategoria.map((l) => [l.categoria, l.valor])), Object.fromEntries(cat.map((c) => [c.categoria, Number(c.total)])));
  const conv = r.porConvenio.find((l) => l.id === convenioId)!;
  assert.deepEqual([conv.faturado, conv.glosado, conv.qtd, conv.pct], [1000.1, 300.25, 2, 30.02]); // 300,25 / 1000,10
  const sem = r.porConvenio.find((l) => l.id === "sem-convenio")!;
  assert.deepEqual([sem.faturado, sem.glosado, sem.pct], [0, 0.1, null]);
  assert.equal(r.porHospital.length, 1);

  const so = await glosasDados({ ...sp, categoria: "LINEAR", convenio: convenioId });
  assert.deepEqual([so.glosado, so.qtd, so.faturado], [200.2, 1, 1000.1]);
  const fora = await glosasDados({ ...sp, de: ymd(dia(-30)), ate: ymd(dia(-10)) });
  assert.deepEqual([fora.glosado, fora.faturado, fora.pct], [0, 0, null]);
});
