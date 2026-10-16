/**
 * Integração entre setores, cadeias que nascem no estoque/qualidade (docs/INTEGRACAO-SETORES.md, eventos 19 a 21):
 * inventário com falta cobrada, recolhimento de lote e ajuste/perda. Só serviços públicos/transacionais; números feitos
 * à mão; cada cadeia termina nas invariantes globais (_invariantes.ts). Rode com `npm run test:db` (sob o lock).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeSP } from "@/lib/datas";
import { LOCAIS, MARCA_COBRAR_HOSPITAL, localDoHospital, movimentar } from "@/lib/estoque";
import { cancelarRemessa, criarRemessa, enviarRemessa, lotesDisponiveis } from "@/app/(app)/estoque/_lib/remessas";
import { concluirContagem, criarInventario, fecharInventario, salvarContagem } from "@/app/(app)/estoque/_lib/inventario-servico";
import { registrarAjusteEstoque } from "@/app/(app)/estoque/_lib/ajustes-servico";
import { inspecionarLoteServico } from "@/app/(app)/qualidade/_lib/inspecao-servico";
import { abrirRecolhimento, concluirRecolhimento, recolherFisico } from "@/app/(app)/qualidade/_lib/recolhimento-servico";
import { confirmarCirurgiaTx, salvarCirurgiaTx } from "@/app/(app)/comercial/_lib/cirurgia-servico";
import { registrarConsumoDiretoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { inventariosACobrar } from "@/app/(app)/financeiro/_lib/leitura-painel";
import { carregarPendencias } from "@/app/(app)/_painel/pendencias";
import { mkHospital, mkLote, mkProduto, num, P, saldoDe, uid } from "./_util";
import { deltaDre, fotoDre, limparIntegracao, painelMes, recusa, tx } from "./_integracao";
import { conferirTudo } from "./_invariantes";

let medicoId: string;
before(async () => {
  await limparIntegracao();
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  await limparIntegracao();
  await db.$disconnect();
});

/** Entrada inicial no depósito (como uma compra já inspecionada): o kardex ENTRADA não mexe no DRE. */
const entrada = (produtoId: string, loteId: string, quantidade: number, custoUnit: number) =>
  tx((t) => movimentar(t, { tipo: "ENTRADA", produtoId, loteId, quantidade, destinoId: LOCAIS.DEPOSITO, custoUnit, documento: `${P}-ENT` }));
const vale = async (hospitalId: string, itens: { produtoId: string; loteId: string; quantidade: number }[], cirurgiaId?: string) => {
  const r = await tx((t) => criarRemessa(t, { hospitalId, cirurgiaId, itens }));
  await tx((t) => enviarRemessa(t, r.id, "teste"));
  return r;
};

test("(iv) inventário: falta cobrada do hospital baixa o saldo sem virar perda e aparece no financeiro como 'a cobrar'; falta ajustada vira perda", async () => {
  const hosp = await mkHospital();
  const local = await tx((t) => localDoHospital(t, hosp.id));
  const p = await mkProduto({ custoMedio: 150 });
  const [lx, ly] = [await mkLote(p.id), await mkLote(p.id)];
  await entrada(p.id, lx.id, 5, 150);
  await entrada(p.id, ly.id, 3, 150);
  await vale(hosp.id, [{ produtoId: p.id, loteId: lx.id, quantidade: 5 }, { produtoId: p.id, loteId: ly.id, quantidade: 3 }]);

  const inv = await tx((t) => criarInventario(t, { hospitalId: hosp.id, usuario: "teste" }));
  const itens = await db.inventarioConsignacaoItem.findMany({ where: { inventarioId: inv.id } });
  const item = (loteId: string) => itens.find((i) => i.loteId === loteId)!.id;
  await tx((t) => salvarContagem(t, inv.id, [{ itemId: item(lx.id), contado: 3 }, { itemId: item(ly.id), contado: 2 }]));
  await tx((t) => concluirContagem(t, inv.id));

  const [dre0, cob0, painel0] = [await fotoDre(), await inventariosACobrar(500), await painelMes()];
  // LX: falta 2 cobrada do hospital (2 × 150 = 300); LY: falta 1 ajustada (perda de 150)
  await tx((t) => fecharInventario(t, inv.id, [{ itemId: item(lx.id), resolucao: "COBRAR_HOSPITAL" }, { itemId: item(ly.id), resolucao: "AJUSTE" }], "teste"));

  assert.deepEqual([await saldoDe(lx.id, local), await saldoDe(ly.id, local)], [3, 2], "estoque: saldo do consignado corrigido");
  const movs = await db.movimento.findMany({ where: { documento: `INV-${inv.id}` }, orderBy: { quantidade: "desc" } });
  assert.deepEqual(movs.map((m) => [m.tipo, m.quantidade, num(m.custoUnit), m.observacao?.startsWith(MARCA_COBRAR_HOSPITAL) ?? false]), [["AJUSTE", 2, 150, true], ["PERDA", 1, 150, false]]);
  const d = deltaDre(dre0, await fotoDre());
  assert.deepEqual([d.chave("PERDA_ESTOQUE"), d.resultado], [-150, -150], "DRE: só a falta ajustada é perda; a cobrada do hospital não");
  const cob1 = await inventariosACobrar(500);
  assert.deepEqual([cob1.qtd - cob0.qtd, Math.round((cob1.total - cob0.total) * 100) / 100], [1, 300]);
  assert.deepEqual(cob1.itens.find((i) => i.id === inv.id)?.valor, 300, "financeiro: visão geral lista o inventário com o valor a cobrar");
  assert.equal(await db.contaReceber.count({ where: { hospitalId: hosp.id } }), 0, "nenhum título automático (decisão M6)");
  assert.equal((await painelMes()).receber, painel0.receber);
  await conferirTudo();
});

test("(v) recolhimento: lote bloqueado some do FEFO, não entra em vale nem sai em vale aberto, consumo recusado; concluído vai ao não conforme sem mexer no DRE", async () => {
  const hosp = await mkHospital();
  const local = await tx((t) => localDoHospital(t, hosp.id));
  const p = await mkProduto({ custoMedio: 80 });
  const lr = await mkLote(p.id);
  await entrada(p.id, lr.id, 8, 80);
  await vale(hosp.id, [{ produtoId: p.id, loteId: lr.id, quantidade: 3 }]);
  const cir = (await tx((t) => salvarCirurgiaTx(t, null, { dataHora: new Date(hojeSP().getTime() + 86400000), hospitalId: hosp.id, medicoId, paciente: `${P} paciente`, sus: false }))).cirurgia;
  await tx((t) => confirmarCirurgiaTx(t, cir.id));
  await tx((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: lr.id, quantidade: 1, usuario: "teste" })); // hospital fica com 2
  const aberta = await tx((t) => criarRemessa(t, { hospitalId: hosp.id, itens: [{ produtoId: p.id, loteId: lr.id, quantidade: 2 }] })); // reserva antes do recall

  const [dre0, pq0] = [await fotoDre(), await carregarPendencias("QUALIDADE")];
  const { recolhimento: rec, foto } = await tx((t) => abrirRecolhimento(t, { loteIds: [lr.id], origem: "FABRICANTE", classe: "II", motivo: `${P} desvio de esterilização`, usuario: "teste" }));
  assert.deepEqual([foto.alvos, foto.pacientes], [2, 1], "foto: depósito (5) e hospital (2); 1 paciente");
  assert.equal((await db.lote.findUniqueOrThrow({ where: { id: lr.id } })).status, "BLOQUEADO");
  assert.equal((await carregarPendencias("QUALIDADE")).recolhimentos.abertos, pq0.recolhimentos.abertos + 1);

  // reflexos: FEFO, novo vale, envio do vale aberto, consumo direto e inspeção
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] }))).length, 0);
  assert.match(await recusa(tx((t) => criarRemessa(t, { hospitalId: hosp.id, itens: [{ produtoId: p.id, loteId: lr.id, quantidade: 1 }] }))), /não está liberado/);
  assert.match(await recusa(tx((t) => enviarRemessa(t, aberta.id, "teste"))), /não está liberado/);
  assert.equal((await db.remessa.findUniqueOrThrow({ where: { id: aberta.id } })).status, "ABERTA");
  const cir2 = (await tx((t) => salvarCirurgiaTx(t, null, { dataHora: new Date(hojeSP().getTime() + 2 * 86400000), hospitalId: hosp.id, medicoId, paciente: `${P} paciente 2`, sus: false }))).cirurgia;
  assert.match(await recusa(tx((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir2.id, loteId: lr.id, quantidade: 1, usuario: "teste" }))), /não está liberado/);
  assert.match(await recusa(tx((t) => inspecionarLoteServico(t, lr.id, { resultado: "LIBERADO", embalagemOk: true, rotulagemOk: true, documentacaoOk: true, inspetor: "teste" }))), /recolhimento/);
  await tx((t) => cancelarRemessa(t, aberta.id));

  // recolhimento físico: depósito 5 e hospital 2 → não conforme 7; concluir
  const alvos = await db.recolhimentoAlvo.findMany({ where: { recolhimentoId: rec.id } });
  for (const a of alvos) await tx((t) => recolherFisico(t, rec.id, { alvoId: a.id, quantidade: a.saldoAbertura }, "teste"));
  await tx((t) => concluirRecolhimento(t, rec.id, `${P} lote recolhido e segregado`, "teste"));
  assert.deepEqual([await saldoDe(lr.id, LOCAIS.DEPOSITO), await saldoDe(lr.id, local), await saldoDe(lr.id, LOCAIS.NAO_CONFORME)], [0, 0, 7]);
  assert.equal((await db.lote.findUniqueOrThrow({ where: { id: lr.id } })).status, "BLOQUEADO", "concluído continua bloqueado");
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [p.id] }))).length, 0);
  assert.equal((await carregarPendencias("QUALIDADE")).recolhimentos.abertos, pq0.recolhimentos.abertos);
  assert.equal(deltaDre(dre0, await fotoDre()).resultado, 0, "segregar não é perda: a perda só entra quando o estoque a registra (cadeia vi)");
  await conferirTudo();
});

test("(vi) ajuste e perda: entrada é ganho, saída e perda são custo no DRE ao custo médio; caixa não muda", async () => {
  const p = await mkProduto({ custoMedio: 50 });
  const l = await mkLote(p.id);
  const [dre0, painel0] = [await fotoDre(), await painelMes()];
  await entrada(p.id, l.id, 10, 50);
  assert.equal(deltaDre(dre0, await fotoDre()).resultado, 0, "entrada de compra (kardex ENTRADA) não é resultado");
  const aj = (operacao: "ENTRADA" | "SAIDA" | "PERDA", quantidade: number) =>
    tx((t) => registrarAjusteEstoque(t, { operacao, localId: LOCAIS.DEPOSITO, loteId: l.id, quantidade, observacao: `${P} ${operacao}`, usuario: "teste" }));
  await aj("ENTRADA", 1); // +50
  await aj("SAIDA", 2); // −100
  await aj("PERDA", 3); // −150
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 6);
  const d = deltaDre(dre0, await fotoDre());
  assert.deepEqual([d.chave("PERDA_ESTOQUE"), d.resultado], [-200, -200]);
  const painel1 = await painelMes();
  assert.deepEqual([painel1.entradas, painel1.saidas, painel1.saldoTotal], [painel0.entradas, painel0.saidas, painel0.saldoTotal]);
  assert.match(await recusa(aj("PERDA", 7)), /Saldo insuficiente/);
  await conferirTudo();
});
