/** Inspeção de recebimento e baixa de vencidos: liberação, reprovação, recolhimento ativo e invariante Saldo == Σ Kardex. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { abrirRecolhimento } from "@/app/(app)/qualidade/_lib/recolhimento-servico";
import { inspecionarLoteServico, marcarVencidosServico, type DadosInspecao } from "@/app/(app)/qualidade/_lib/inspecao-servico";
import { conferirKardex, limparTudo, mkLote, mkProduto, P, saldoDe } from "./_util";

// Inspecao não está no limparTudo compartilhado: este arquivo apaga as suas antes (o lote só sai depois).
const limparInspecoes = () => db.inspecao.deleteMany({ where: { lote: { produto: { codigo: { startsWith: P } } } } });
before(async () => {
  await limparInspecoes();
  await limparTudo();
});
after(async () => {
  await limparInspecoes();
  await limparTudo();
  await db.$disconnect();
});

const ok: DadosInspecao = { resultado: "LIBERADO", embalagemOk: true, rotulagemOk: true, documentacaoOk: true, inspetor: "teste" };
const inspecionar = (loteId: string, d: Partial<DadosInspecao> = {}) => db.$transaction((t) => inspecionarLoteServico(t, loteId, { ...ok, ...d }));

async function emQuarentena(qtd: number, o: { validadeDias?: number } = {}) {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id, { status: "QUARENTENA", validadeDias: o.validadeDias });
  await db.$transaction((t) => movimentar(t, { tipo: "ENTRADA", produtoId: p.id, loteId: l.id, quantidade: qtd, destinoId: LOCAIS.QUARENTENA, custoUnit: 10 }));
  return { p, l };
}
const statusLote = async (id: string) => (await db.lote.findUniqueOrThrow({ where: { id } })).status;

test("aprova: lote LIBERADO e saldo da quarentena vai ao depósito", async () => {
  const { p, l } = await emQuarentena(7);
  const r = await inspecionar(l.id);
  assert.equal(r.movido, 7);
  assert.equal(await statusLote(l.id), "LIBERADO");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 0);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 7);
  const insp = await db.inspecao.findFirstOrThrow({ where: { loteId: l.id } });
  assert.equal(insp.resultado, "LIBERADO");
  assert.ok(p.id);
  await conferirKardex(l.id);
});

test("reprova: NAO_CONFORME e saldo vai ao local não conforme", async () => {
  const { l } = await emQuarentena(4);
  const r = await inspecionar(l.id, { resultado: "NAO_CONFORME", embalagemOk: false, observacao: "embalagem rasgada" });
  assert.equal(r.movido, 4);
  assert.equal(await statusLote(l.id), "NAO_CONFORME");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 0);
  assert.equal(await saldoDe(l.id, LOCAIS.NAO_CONFORME), 4);
  await conferirKardex(l.id);
});

test("lote vencido não é liberado e nada muda", async () => {
  const { l } = await emQuarentena(3, { validadeDias: -2 });
  await assert.rejects(inspecionar(l.id), /vencido em/);
  assert.equal(await statusLote(l.id), "QUARENTENA");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 3);
  assert.equal(await db.inspecao.count({ where: { loteId: l.id } }), 0);
});

test("lote com recolhimento ativo não é re-liberado nem inspecionado", async () => {
  const { l } = await emQuarentena(5);
  await db.$transaction((t) => abrirRecolhimento(t, { loteIds: [l.id], origem: "FABRICANTE", classe: "II", motivo: `${P} desvio`, usuario: "teste" }));
  await assert.rejects(inspecionar(l.id), /em recolhimento/);
  await assert.rejects(inspecionar(l.id, { resultado: "BLOQUEADO", observacao: "x" }), /em recolhimento/);
  assert.equal(await statusLote(l.id), "BLOQUEADO");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 5);
  assert.equal(await db.inspecao.count({ where: { loteId: l.id } }), 0);
  await conferirKardex(l.id);
});

test("lote inexistente: mensagem de negócio", async () => {
  await assert.rejects(inspecionar("nao-existe"), /Lote não encontrado/);
});

test("marcar vencidos: só LIBERADO vencido muda", async () => {
  const p = await mkProduto();
  const venc = await mkLote(p.id, { validadeDias: -5 });
  const vigente = await mkLote(p.id);
  const bloq = await mkLote(p.id, { validadeDias: -5, status: "BLOQUEADO" });
  // Transação revertida no fim: o banco é o de desenvolvimento e a regra varre todos os lotes liberados vencidos.
  const REVERTER = new Error("reverter");
  await assert.rejects(
    db.$transaction(async (t) => {
      const alvo = await marcarVencidosServico(t);
      assert.ok(alvo.some((a) => a.id === venc.id));
      assert.ok(!alvo.some((a) => a.id === vigente.id || a.id === bloq.id));
      const st = async (id: string) => (await t.lote.findUniqueOrThrow({ where: { id } })).status;
      assert.equal(await st(venc.id), "VENCIDO");
      assert.equal(await st(vigente.id), "LIBERADO");
      assert.equal(await st(bloq.id), "BLOQUEADO");
      throw REVERTER;
    }),
    REVERTER,
  );
  assert.equal(await statusLote(venc.id), "LIBERADO");
});

// Varredura funcional (REVISAO §20): inspeção repetida e lote com parte já liberada.
test("inspeção repetida (segunda aba / reenvio) é recusada: sem saldo na quarentena nada muda", async () => {
  const { l } = await emQuarentena(5);
  await inspecionar(l.id);
  const antes = await db.inspecao.count({ where: { loteId: l.id } });
  await assert.rejects(inspecionar(l.id, { resultado: "BLOQUEADO" }), /não tem saldo na quarentena/);
  assert.equal(await statusLote(l.id), "LIBERADO");
  assert.equal(await db.inspecao.count({ where: { loteId: l.id } }), antes);
});

test("nova entrega de lote já liberado: reprovar é recusado (não rebaixa o que já está no depósito); aprovar move só a quarentena", async () => {
  const { p, l } = await emQuarentena(10);
  await inspecionar(l.id);
  // nova entrega do mesmo lote cai na quarentena com o lote ainda LIBERADO
  await db.$transaction((t) => movimentar(t, { tipo: "ENTRADA", produtoId: p.id, loteId: l.id, quantidade: 5, destinoId: LOCAIS.QUARENTENA, custoUnit: 10 }));
  await assert.rejects(inspecionar(l.id, { resultado: "NAO_CONFORME" }), /já está liberada/);
  assert.equal(await statusLote(l.id), "LIBERADO");
  assert.equal(await saldoDe(l.id, LOCAIS.QUARENTENA), 5);
  const r = await inspecionar(l.id);
  assert.equal(r.movido, 5);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 15);
  await conferirKardex(l.id);
});
