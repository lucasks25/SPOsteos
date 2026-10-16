/**
 * Corridas que só uma trava de linha resolve (revisão estática de 16/10): cada teste segura uma transação aberta depois de
 * travar, dispara a operação concorrente e confere o resultado. Sem a trava, cada cenário reproduz o defeito de forma
 * determinística (comentado em cada teste). Apaga o que cria.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, type Tx } from "@/lib/db";
import { errorMessage } from "@/lib/forms";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { abrirRecolhimento } from "@/app/(app)/qualidade/_lib/recolhimento-servico";
import { inspecionarLoteServico } from "@/app/(app)/qualidade/_lib/inspecao-servico";
import { conferirRemessa, criarRemessa, enviarRemessa } from "@/app/(app)/estoque/_lib/remessas";
import { registrarConsumoDiretoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { travarCirurgia } from "@/app/(app)/comercial/_lib/trava-cirurgia";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { exigirOrcamentoEditavelTx, mudarStatusOrcamentoTx } from "@/app/(app)/comercial/_lib/orcamento-servico";
import { conferirKardex, dia, limparTudo, mkHospital, mkLote, mkProduto, P, saldoDe, uid } from "./_util";

let hospitalId: string, localHosp: string, medicoId: string;
const limparExtras = async () => {
  await db.inspecao.deleteMany({ where: { lote: { produto: { codigo: { startsWith: P } } } } });
  await db.orcamento.deleteMany({ where: { paciente: { startsWith: P } } });
};
before(async () => {
  await limparExtras();
  await limparTudo();
  hospitalId = (await mkHospital()).id;
  localHosp = await db.$transaction((t) => localDoHospital(t, hospitalId));
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  await limparExtras();
  await limparTudo();
  await db.$disconnect();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Abre uma transação, roda `antes` (que trava linhas), avisa por `travou` e segura o commit por `ms`. */
function segurar<T>(antes: (t: Tx) => Promise<T>, ms = 600) {
  let pronto!: () => void;
  const travou = new Promise<void>((r) => (pronto = r));
  const fim = db.$transaction(async (t) => {
    const r = await antes(t);
    pronto();
    await sleep(ms);
    return r;
  });
  fim.catch(() => undefined).finally(() => pronto());
  return { travou, fim };
}
const entrada = (produtoId: string, loteId: string, quantidade: number, destinoId: string) =>
  db.$transaction((t) => movimentar(t, { tipo: "ENTRADA", produtoId, loteId, quantidade, destinoId, custoUnit: 10 }));
const abrirRecall = (t: Tx, loteId: string) => abrirRecolhimento(t, { loteIds: [loteId], origem: "FABRICANTE", classe: "II", motivo: `${P} corrida`, usuario: "teste" });
const statusLote = async (id: string) => (await db.lote.findUniqueOrThrow({ where: { id } })).status;
const motivo = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : "");

test("inspeção × abertura de recolhimento: o lote em recall nunca volta a LIBERADO", async () => {
  // Sem a trava do lote: a inspeção lia "sem recolhimento", esperava só no UPDATE do lote e gravava LIBERADO por cima do BLOQUEADO.
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id, { status: "QUARENTENA" });
  await entrada(p.id, l.id, 4, LOCAIS.QUARENTENA);
  const rec = segurar((t) => abrirRecall(t, l.id));
  await rec.travou;
  const insp = db.$transaction((t) => inspecionarLoteServico(t, l.id, { resultado: "LIBERADO", embalagemOk: true, rotulagemOk: true, documentacaoOk: true, inspetor: "teste" }));
  const [r1, r2] = await Promise.allSettled([rec.fim, insp]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.equal(r2.status, "rejected", "a inspeção devia ser recusada");
  assert.match(motivo(r2), /em recolhimento/);
  assert.equal(await statusLote(l.id), "BLOQUEADO");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 4, "nada saiu da quarentena");
  await conferirKardex(l.id);
});

test("envio de vale × abertura de recolhimento: lote bloqueado não sai para o hospital", async () => {
  // Sem a trava: o envio lia LIBERADO, esperava só na chave estrangeira do Movimento e mandava ao hospital um lote já em recall.
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  await entrada(p.id, l.id, 10, LOCAIS.DEPOSITO);
  const rem = await db.$transaction((t) => criarRemessa(t, { hospitalId, itens: [{ produtoId: p.id, loteId: l.id, quantidade: 3 }] }));
  const rec = segurar((t) => abrirRecall(t, l.id));
  await rec.travou;
  const env = db.$transaction((t) => enviarRemessa(t, rem.id, "teste"));
  const [r1, r2] = await Promise.allSettled([rec.fim, env]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.equal(r2.status, "rejected", "o envio devia ser recusado");
  assert.match(motivo(r2), /não está liberado/);
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: rem.id } })).status, "ABERTA");
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 10);
  assert.equal(await saldoDe(l.id, localHosp), 0);
  await conferirKardex(l.id);
});

test("consumo direto × abertura de recolhimento: lote bloqueado não é consumido", async () => {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  await entrada(p.id, l.id, 5, localHosp);
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente ${uid()}`, status: "CONFIRMADA" } });
  const rec = segurar((t) => abrirRecall(t, l.id));
  await rec.travou;
  const cons = db.$transaction((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: l.id, quantidade: 2, usuario: "teste" }));
  const [r1, r2] = await Promise.allSettled([rec.fim, cons]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.equal(r2.status, "rejected", "o consumo devia ser recusado");
  assert.match(motivo(r2), /não está liberado/);
  assert.equal(await saldoDe(l.id, localHosp), 5);
  assert.equal(await db.cirurgiaConsumo.count({ where: { cirurgiaId: cir.id } }), 0);
  await conferirKardex(l.id);
});

test("conferência de vale × consumo direto na mesma cirurgia: sem deadlock, os dois entram", async () => {
  // Antes: a conferência travava o Saldo e depois a Cirurgia; o consumo direto, Cirurgia e depois Saldo → deadlock (40P01).
  const p = await mkProduto({ custoMedio: 10, precoBase: 25 });
  const l = await mkLote(p.id);
  await entrada(p.id, l.id, 10, LOCAIS.DEPOSITO);
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente ${uid()}`, status: "CONFIRMADA" } });
  const rem = await db.$transaction((t) => criarRemessa(t, { hospitalId, cirurgiaId: cir.id, itens: [{ produtoId: p.id, loteId: l.id, quantidade: 5 }] }));
  await db.$transaction((t) => enviarRemessa(t, rem.id, "teste"));
  const [item] = await db.remessaItem.findMany({ where: { remessaId: rem.id } });

  // o consumo direto trava a cirurgia, deixa a conferência começar e só então mexe no saldo do hospital
  let comecou!: () => void;
  const conferiu = new Promise<void>((r) => (comecou = r));
  const consumo = db.$transaction(async (t) => {
    await travarCirurgia(t, cir.id);
    comecou();
    await sleep(400); // a conferência já está rodando: no código antigo ela travava o saldo neste intervalo
    return registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: l.id, quantidade: 1, usuario: "teste" });
  });
  await conferiu;
  const conf = db.$transaction((t) => conferirRemessa(t, rem.id, [{ itemId: item.id, devolvido: 0, consumido: 2 }], "teste"));
  const [r1, r2] = await Promise.allSettled([consumo, conf]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.equal(r2.status, "fulfilled", motivo(r2));
  assert.equal(await saldoDe(l.id, localHosp), 2, "5 enviados − 1 direto − 2 do vale");
  const consumido = (await db.cirurgiaConsumo.findMany({ where: { cirurgiaId: cir.id } })).reduce((s, c) => s + c.quantidade, 0);
  assert.equal(consumido, 3);
  await conferirKardex(l.id);
});

test("errorMessage: deadlock real (P2010/40P01 do adapter-pg), P2028 e pool cheio viram 'sistema ocupado' sem detalhe", async () => {
  const [a, b] = [await mkProduto(), await mkProduto()];
  const t1 = db.$transaction(async (t) => {
    await t.$executeRaw`UPDATE "Produto" SET "estoqueMinimo" = "estoqueMinimo" WHERE id = ${a.id}`;
    await sleep(300);
    await t.$executeRaw`UPDATE "Produto" SET "estoqueMinimo" = "estoqueMinimo" WHERE id = ${b.id}`;
  });
  const t2 = db.$transaction(async (t) => {
    await t.$executeRaw`UPDATE "Produto" SET "estoqueMinimo" = "estoqueMinimo" WHERE id = ${b.id}`;
    await sleep(300);
    await t.$executeRaw`UPDATE "Produto" SET "estoqueMinimo" = "estoqueMinimo" WHERE id = ${a.id}`;
  });
  const rs = await Promise.allSettled([t1, t2]);
  const falhas = rs.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(falhas.length, 1, "o Postgres derruba uma das duas");
  const msg = errorMessage(falhas[0].reason);
  assert.equal(msg, "O sistema está ocupado; tente de novo em instantes.");

  const timeout = await db.$transaction(async (t) => { await sleep(150); await t.$queryRaw`SELECT 1`; }, { timeout: 50 }).catch((e) => e);
  assert.equal(errorMessage(timeout), "O sistema está ocupado; tente de novo em instantes.");
  assert.equal(errorMessage(new Error("timeout exceeded when trying to connect")), "O sistema está ocupado; tente de novo em instantes.");
});

test("NF: dois registros simultâneos do mesmo número em pedidos diferentes → só um passa (índice parcial)", async () => {
  // Sem o índice: o segundo não via o primeiro (ainda sem commit) na checagem e os dois pedidos ficavam com a mesma NF.
  const nf = `${P}NF${uid()}`;
  const pv1 = await db.pedidoVenda.create({ data: { hospitalId, status: "ABERTO", total: 100 } });
  const pv2 = await db.pedidoVenda.create({ data: { hospitalId, status: "ABERTO", total: 100 } });
  const primeiro = segurar((t) => registrarNfTx(t, pv1.id, nf, dia(30)), 400);
  await primeiro.travou;
  const segundo = db.$transaction((t) => registrarNfTx(t, pv2.id, nf, dia(30)));
  const [r1, r2] = await Promise.allSettled([primeiro.fim, segundo]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.equal(r2.status, "rejected");
  assert.match(errorMessage((r2 as PromiseRejectedResult).reason), /^Esta NF já está registrada em outro pedido/);
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv2.id } })).status, "ABERTO");
  assert.equal(await db.contaReceber.count({ where: { pedidoId: pv2.id } }), 0);
  // pedido cancelado libera o número (o índice ignora CANCELADO, como a checagem do serviço)
  await db.contaReceber.deleteMany({ where: { pedidoId: pv1.id } });
  await db.pedidoVenda.update({ where: { id: pv1.id }, data: { status: "CANCELADO" } });
  await db.$transaction((t) => registrarNfTx(t, pv2.id, nf, dia(30)));
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv2.id } })).numeroNf, nf);
});

test("orçamento: edição espera o envio em curso e é recusada; fora de rascunho também", async () => {
  // Antes a checagem de rascunho rodava fora da transação: o item entrava num orçamento que acabara de ser ENVIADO.
  const o = await db.orcamento.create({ data: { hospitalId, paciente: `${P} orc ${uid()}` } });
  const produtoId = (await mkProduto()).id;
  await db.orcamentoItem.create({ data: { orcamentoId: o.id, produtoId, quantidade: 1, precoUnit: 10 } });
  const envio = segurar((t) => mudarStatusOrcamentoTx(t, o.id, "ENVIADO"), 400);
  await envio.travou;
  const edicao = db.$transaction(async (t) => {
    await exigirOrcamentoEditavelTx(t, o.id);
    await t.orcamentoItem.create({ data: { orcamentoId: o.id, produtoId, quantidade: 2, precoUnit: 10 } });
  });
  const [r1, r2] = await Promise.allSettled([envio.fim, edicao]);
  assert.equal(r1.status, "fulfilled", motivo(r1));
  assert.match(motivo(r2), /orçamentos em rascunho/);
  assert.equal(await db.orcamentoItem.count({ where: { orcamentoId: o.id } }), 1);
  await assert.rejects(db.$transaction((t) => exigirOrcamentoEditavelTx(t, o.id)), /orçamentos em rascunho/);
});
