/** Recolhimento de lote: bloqueio, foto, recolhimento físico, conclusão, cancelamento e concorrência. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { carregarPendencias, listarPendencias } from "@/lib/pendencias";
import { criarRemessa, enviarRemessa, lotesDisponiveis } from "@/app/(app)/estoque/_lib/remessas";
import {
  abrirRecolhimento,
  atualizarFoto,
  cancelarRecolhimento,
  comunicarPacientes,
  concluirRecolhimento,
  justificarAlvo,
  recolhimentoAtivoDoLote,
  recolherFisico,
  registrarComunicado,
  situacaoAlvos,
} from "@/app/(app)/qualidade/_lib/recolhimento-servico";
import { conferirKardex, dia, limparTudo, mkHospital, mkLote, mkProduto, P, saldoDe, uid } from "./_util";

let hospitalId: string, localHosp: string, medicoId: string;
before(async () => {
  await limparTudo();
  hospitalId = (await mkHospital()).id;
  localHosp = await db.$transaction((t) => localDoHospital(t, hospitalId));
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
const mov = (produtoId: string, loteId: string, quantidade: number, destinoId: string) => tx((t) => movimentar(t, { tipo: "ENTRADA", produtoId, loteId, quantidade, destinoId, custoUnit: 10 }));
const abrir = (loteIds: string[], extra: { prazo?: Date } = {}) =>
  tx((t) => abrirRecolhimento(t, { loteIds, origem: "FABRICANTE", classe: "II", motivo: `${P} desvio de esterilização`, usuario: "teste", ...extra }));
const statusLote = async (id: string) => (await db.lote.findUniqueOrThrow({ where: { id } })).status;
const alvoDe = (recId: number, loteId: string, localId: string) => db.recolhimentoAlvo.findUniqueOrThrow({ where: { recolhimentoId_loteId_localId: { recolhimentoId: recId, loteId, localId } } });
const recolher = (recId: number, alvoId: string, quantidade: number) => tx((t) => recolherFisico(t, recId, { alvoId, quantidade }, "teste"));
const concluir = (recId: number) => tx((t) => concluirRecolhimento(t, recId, "Material segregado e devolvido ao fabricante.", "teste"));

/** Produto com um lote LIBERADO: 10 no depósito, 6 no hospital e uma cirurgia (paciente TESTEDB) que usou 2. */
async function cenario() {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  await mov(p.id, l.id, 10, LOCAIS.DEPOSITO);
  await mov(p.id, l.id, 6, localHosp);
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} paciente ${uid()}`, status: "REALIZADA" } });
  await db.cirurgiaConsumo.create({ data: { cirurgiaId: cir.id, produtoId: p.id, loteId: l.id, quantidade: 2 } });
  return { p, l, cir };
}

test("abertura: bloqueia o lote, fotografa locais e pacientes, e o lote sai do FEFO e do envio de remessa", async () => {
  const { p, l, cir } = await cenario();
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] }))).length, 1, "antes: disponível para remessa");
  const rem = await tx((t) => criarRemessa(t, { hospitalId, itens: [{ produtoId: p.id, loteId: l.id, quantidade: 1 }] })); // ABERTA, ainda sem movimento

  const { recolhimento: rec, foto } = await abrir([l.id]);
  assert.equal(await statusLote(l.id), "BLOQUEADO");
  assert.deepEqual(foto, { alvos: 2, pacientes: 1 });
  assert.equal((await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO)).saldoAbertura, 10);
  assert.equal((await alvoDe(rec.id, l.id, localHosp)).saldoAbertura, 6);
  const pac = await db.recolhimentoPaciente.findMany({ where: { recolhimentoId: rec.id } });
  assert.equal(pac.length, 1);
  assert.equal(pac[0].cirurgiaId, cir.id);
  const rl = await db.recolhimentoLote.findFirstOrThrow({ where: { recolhimentoId: rec.id } });
  assert.deepEqual([rl.statusAnterior, rl.bloqueadoPorEste], ["LIBERADO", true]);

  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] }))).length, 0, "lote bloqueado fora do FEFO");
  await assert.rejects(tx((t) => enviarRemessa(t, rem.id, "teste")), /não está liberado/);
  assert.equal(await recolhimentoAtivoDoLote(db, l.id), rec.id);
  await conferirKardex(l.id);
});

test("recolhimento físico: hospital vira RETORNO, depósito vira TRANSFERENCIA, vai ao não conforme; mais que o saldo é recusado", async () => {
  const { p, l } = await cenario();
  const { recolhimento: rec } = await abrir([l.id]);
  const hosp = await alvoDe(rec.id, l.id, localHosp);
  const dep = await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO);
  const ncAntes = await saldoDe(l.id, LOCAIS.NAO_CONFORME);

  await assert.rejects(recolher(rec.id, hosp.id, 7), /saldo atual neste local é 6/);
  await assert.rejects(recolher(rec.id, hosp.id, 0), /maior que zero/);
  await recolher(rec.id, hosp.id, 4); // parcial
  assert.equal(await saldoDe(l.id, localHosp), 2);
  assert.equal((await alvoDe(rec.id, l.id, localHosp)).status, "PENDENTE");
  assert.equal((await db.recolhimento.findUniqueOrThrow({ where: { id: rec.id } })).status, "EM_ANDAMENTO");
  await recolher(rec.id, hosp.id, 2);
  assert.equal((await alvoDe(rec.id, l.id, localHosp)).status, "RECOLHIDO");
  await recolher(rec.id, dep.id, 10);
  assert.equal(await saldoDe(l.id, LOCAIS.NAO_CONFORME), ncAntes + 16);

  const movs = await db.movimento.findMany({ where: { loteId: l.id, documento: `REC-${rec.id}` } });
  assert.deepEqual(movs.map((m) => m.tipo).sort(), ["RETORNO", "RETORNO", "TRANSFERENCIA"]);
  assert.ok(movs.every((m) => m.destinoId === LOCAIS.NAO_CONFORME));
  await conferirKardex(l.id);
  void p;
});

test("saldo que mudou desde a abertura é mostrado e limita o recolhimento", async () => {
  const { p, l } = await cenario();
  const { recolhimento: rec } = await abrir([l.id]);
  await tx((t) => movimentar(t, { tipo: "CONSUMO", produtoId: p.id, loteId: l.id, quantidade: 5, origemId: localHosp, documento: `${P}-X` })); // consumo registrado depois da foto
  const { itens } = await situacaoAlvos(db, rec.id);
  const h = itens.find((i) => i.localId === localHosp)!;
  assert.deepEqual([h.saldoAbertura, h.saldoAtual, h.mudou, h.falta], [6, 1, true, 1]);
  await assert.rejects(recolher(rec.id, h.id, 2), /saldo atual neste local é 1/);
  await recolher(rec.id, h.id, 1);
  await conferirKardex(l.id);
});

test("concluir: recusado com pendência; aceito com recolhimento ou justificativa; depois é imutável e congela o saldo", async () => {
  const { l } = await cenario();
  const { recolhimento: rec } = await abrir([l.id]);
  await assert.rejects(concluir(rec.id), /Não é possível concluir/);
  const hosp = await alvoDe(rec.id, l.id, localHosp);
  const dep = await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO);
  await recolher(rec.id, hosp.id, 6);
  await assert.rejects(concluir(rec.id), /Depósito|Consignado|lote/i); // depósito ainda pendente
  await assert.rejects(tx((t) => justificarAlvo(t, rec.id, dep.id, "x", "teste")), /mais detalhe/);
  await tx((t) => justificarAlvo(t, rec.id, dep.id, "Devolvido ao fabricante em 15/10 (NF 123).", "teste"));
  await assert.rejects(tx((t) => concluirRecolhimento(t, rec.id, "  ", "teste")), /parecer/);
  await concluir(rec.id);

  const fim = await db.recolhimento.findUniqueOrThrow({ where: { id: rec.id } });
  assert.equal(fim.status, "CONCLUIDO");
  assert.equal(fim.concluidoPor, "teste");
  assert.equal((await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO)).saldoFinal, 10);
  assert.equal((await alvoDe(rec.id, l.id, localHosp)).saldoFinal, 0);
  assert.equal(await statusLote(l.id), "BLOQUEADO", "lote segue bloqueado após concluir");
  // imutável
  await assert.rejects(recolher(rec.id, dep.id, 1), /já concluído/);
  await assert.rejects(concluir(rec.id), /já concluído/);
  await assert.rejects(tx((t) => cancelarRecolhimento(t, rec.id, "x", "teste")), /já concluído/);
  await assert.rejects(tx((t) => justificarAlvo(t, rec.id, dep.id, null, "teste")), /já concluído/);
  await assert.rejects(tx((t) => atualizarFoto(t, rec.id, "teste")), /já concluído/);
  assert.equal(await recolhimentoAtivoDoLote(db, l.id), null);
  // mexer no estoque depois não altera o relatório congelado
  await tx((t) => movimentar(t, { tipo: "AJUSTE", produtoId: l.produtoId, loteId: l.id, quantidade: 3, origemId: LOCAIS.DEPOSITO, documento: `${P}-Y` }));
  const { itens } = await situacaoAlvos(db, rec.id);
  assert.equal(itens.find((i) => i.localId === LOCAIS.DEPOSITO)!.saldoAtual, 10);
});

test("alvo sem saldo ao concluir vira SEM_SALDO; local fora da foto e uso novo em cirurgia exigem atualizar a foto", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await mov(p.id, l.id, 4, LOCAIS.DEPOSITO);
  const { recolhimento: rec } = await abrir([l.id]);
  const dep = await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO);
  await tx((t) => movimentar(t, { tipo: "PERDA", produtoId: p.id, loteId: l.id, quantidade: 4, origemId: LOCAIS.DEPOSITO, documento: `${P}-Z` })); // sumiu antes do recolhimento
  await mov(p.id, l.id, 3, localHosp); // apareceu saldo em local fora da foto
  await assert.rejects(concluir(rec.id), /fora da lista/);
  assert.deepEqual(await tx((t) => atualizarFoto(t, rec.id, "teste")), { alvos: 1, pacientes: 0 });
  const novo = await alvoDe(rec.id, l.id, localHosp);
  await recolher(rec.id, novo.id, 3);
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId, medicoId, paciente: `${P} tardio`, status: "REALIZADA" } });
  await db.cirurgiaConsumo.create({ data: { cirurgiaId: cir.id, produtoId: p.id, loteId: l.id, quantidade: 1 } });
  await assert.rejects(concluir(rec.id), /uso\(s\) em cirurgia fora da lista/);
  assert.deepEqual(await tx((t) => atualizarFoto(t, rec.id, "teste")), { alvos: 0, pacientes: 1 });
  await concluir(rec.id);
  assert.equal((await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO)).status, "SEM_SALDO");
  assert.equal(dep.saldoAbertura, 4);
  await conferirKardex(l.id);
});

test("dois recolhimentos simultâneos do mesmo alvo: a soma não passa do saldo", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await mov(p.id, l.id, 10, LOCAIS.DEPOSITO);
  const { recolhimento: a } = await abrir([l.id]);
  const { recolhimento: b } = await abrir([l.id]);
  const alvoA = await alvoDe(a.id, l.id, LOCAIS.DEPOSITO);
  const alvoB = await alvoDe(b.id, l.id, LOCAIS.DEPOSITO);
  const r = await Promise.allSettled([recolher(a.id, alvoA.id, 7), recolher(b.id, alvoB.id, 7)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(r.filter((x) => x.status === "rejected").length, 1);
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 3);
  assert.equal(await saldoDe(l.id, LOCAIS.NAO_CONFORME), 7);
  const soma = (await alvoDe(a.id, l.id, LOCAIS.DEPOSITO)).quantidadeRecolhida + (await alvoDe(b.id, l.id, LOCAIS.DEPOSITO)).quantidadeRecolhida;
  assert.equal(soma, 7);
  await conferirKardex(l.id);
});

test("cancelar desbloqueia só os lotes que este recolhimento bloqueou; com recolhimento físico é recusado", async () => {
  const p = await mkProduto();
  const l1 = await mkLote(p.id); // LIBERADO
  const l2 = await mkLote(p.id, { status: "BLOQUEADO" }); // já bloqueado por outro motivo
  const l3 = await mkLote(p.id, { status: "QUARENTENA" });
  for (const l of [l1, l2, l3]) await mov(p.id, l.id, 5, LOCAIS.DEPOSITO);
  const { recolhimento: rec } = await abrir([l1.id, l2.id, l3.id]);
  assert.deepEqual(await Promise.all([l1, l2, l3].map((l) => statusLote(l.id))), ["BLOQUEADO", "BLOQUEADO", "BLOQUEADO"]);
  await assert.rejects(tx((t) => cancelarRecolhimento(t, rec.id, "  ", "teste")), /motivo/);
  const des = await tx((t) => cancelarRecolhimento(t, rec.id, "Alerta improcedente", "teste"));
  assert.equal(des.length, 2);
  assert.deepEqual(await Promise.all([l1, l2, l3].map((l) => statusLote(l.id))), ["LIBERADO", "BLOQUEADO", "QUARENTENA"]);
  const c = await db.recolhimento.findUniqueOrThrow({ where: { id: rec.id } });
  assert.deepEqual([c.status, c.canceladoPor, c.motivoCancelamento], ["CANCELADO", "teste", "Alerta improcedente"]);
  await assert.rejects(tx((t) => cancelarRecolhimento(t, rec.id, "de novo", "teste")), /cancelado/);

  const { recolhimento: r2 } = await abrir([l1.id]);
  await recolher(r2.id, (await alvoDe(r2.id, l1.id, LOCAIS.DEPOSITO)).id, 1);
  await assert.rejects(tx((t) => cancelarRecolhimento(t, r2.id, "tarde", "teste")), /recolhimento físico/);
  assert.equal(await statusLote(l1.id), "BLOQUEADO");
});

test("lote em dois recolhimentos: cancelar o que bloqueou não libera enquanto o outro estiver ativo", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await mov(p.id, l.id, 2, LOCAIS.DEPOSITO);
  const { recolhimento: a } = await abrir([l.id]);
  const { recolhimento: b } = await abrir([l.id]);
  assert.equal((await db.recolhimentoLote.findFirstOrThrow({ where: { recolhimentoId: b.id } })).bloqueadoPorEste, false);
  await tx((t) => cancelarRecolhimento(t, a.id, "duplicado", "teste"));
  assert.equal(await statusLote(l.id), "BLOQUEADO");
  assert.equal(await recolhimentoAtivoDoLote(db, l.id), b.id);
  await tx((t) => cancelarRecolhimento(t, b.id, "duplicado também", "teste"));
  assert.equal(await statusLote(l.id), "LIBERADO", "o último cancelamento restaura o status original");
});

test("comunicado do hospital e de pacientes: marca só o pendente e registra ações", async () => {
  const { l } = await cenario();
  const { recolhimento: rec } = await abrir([l.id]);
  assert.equal(await tx((t) => registrarComunicado(t, rec.id, localHosp, "teste")), 1);
  await assert.rejects(tx((t) => registrarComunicado(t, rec.id, localHosp, "teste")), /já constam/);
  await assert.rejects(tx((t) => registrarComunicado(t, rec.id, "inexistente", "teste")), /não encontrado/);
  assert.equal((await alvoDe(rec.id, l.id, localHosp)).status, "COMUNICADO");
  assert.equal((await alvoDe(rec.id, l.id, LOCAIS.DEPOSITO)).status, "PENDENTE");
  const pac = await db.recolhimentoPaciente.findMany({ where: { recolhimentoId: rec.id } });
  assert.equal(await tx((t) => comunicarPacientes(t, rec.id, pac.map((x) => x.id), "teste", "médico avisado")), 1);
  await assert.rejects(tx((t) => comunicarPacientes(t, rec.id, pac.map((x) => x.id), "teste")), /pendente/);
  const tipos = (await db.recolhimentoAcao.findMany({ where: { recolhimentoId: rec.id } })).map((a) => a.tipo);
  assert.deepEqual([...new Set(tipos)].sort(), ["ABERTURA", "BLOQUEIO", "COMUNICADO", "PACIENTE"]);
});

test("pendências: recolhimento aberto aparece para Qualidade/Estoque/Admin, vencido em vermelho, e não para Comercial", async () => {
  const antes = { q: await carregarPendencias("QUALIDADE"), e: await carregarPendencias("ESTOQUE"), c: await carregarPendencias("COMERCIAL"), a: await carregarPendencias("ADMIN") };
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await mov(p.id, l.id, 1, LOCAIS.DEPOSITO);
  const { recolhimento: rec } = await abrir([l.id], { prazo: dia(-3) });
  const depois = { q: await carregarPendencias("QUALIDADE"), e: await carregarPendencias("ESTOQUE"), c: await carregarPendencias("COMERCIAL"), a: await carregarPendencias("ADMIN") };
  for (const k of ["q", "e", "a"] as const) {
    assert.equal(depois[k].recolhimentos.abertos, antes[k].recolhimentos.abertos + 1);
    assert.equal(depois[k].recolhimentos.vencidos, antes[k].recolhimentos.vencidos + 1);
  }
  assert.deepEqual(depois.c.recolhimentos, { abertos: 0, vencidos: 0 });
  const item = listarPendencias(depois.q).find((x) => x.key === "recol")!;
  assert.equal(item.tom, "danger");
  assert.equal(item.href, "/qualidade/recolhimentos");
  await tx((t) => cancelarRecolhimento(t, rec.id, "teste de pendência", "teste"));
  assert.equal((await carregarPendencias("QUALIDADE")).recolhimentos.abertos, antes.q.recolhimentos.abertos);
});

test("validações de abertura: sem lote, sem motivo e lote inexistente", async () => {
  await assert.rejects(abrir([]), /ao menos um lote/);
  await assert.rejects(tx((t) => abrirRecolhimento(t, { loteIds: ["x"], origem: "INTERNO", classe: "III", motivo: " ", usuario: "t" })), /motivo/);
  await assert.rejects(tx((t) => abrirRecolhimento(t, { loteIds: ["nao-existe"], origem: "INTERNO", classe: "III", motivo: `${P} m`, usuario: "t" })), /Lote não encontrado/);
});
