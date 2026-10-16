/** Ajustes de estoque (entrada/saída/perda) e kits: regras dos serviços de estoque/_lib. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, localDoHospital } from "@/lib/estoque";
import { registrarAjusteEstoque } from "@/app/(app)/estoque/_lib/ajustes-servico";
import { adicionarItemKit, criarKit, editarKit, excluirKit, removerItemKit } from "@/app/(app)/estoque/_lib/kits-servico";
import { conferirKardex, limparTudo, mkHospital, mkLote, mkProduto, P, saldoDe, uid } from "./_util";

async function limpar() {
  await db.remessa.deleteMany({ where: { kit: { codigo: { startsWith: P } } } });
  await db.kit.deleteMany({ where: { codigo: { startsWith: P } } }); // itens em cascata
  await limparTudo();
}
before(limpar);
after(async () => {
  await limpar();
  await db.$disconnect();
});

const ajustar = (o: { operacao: "ENTRADA" | "SAIDA" | "PERDA"; loteId: string; quantidade: number; observacao?: string }) =>
  db.$transaction((tx) => registrarAjusteEstoque(tx, { localId: LOCAIS.DEPOSITO, usuario: "teste", ...o }));

test("ajuste: entrada soma, saída subtrai, perda registra tipo PERDA; Saldo == Kardex", async () => {
  const p = await mkProduto({ custoMedio: 7 });
  const l = await mkLote(p.id);
  const e = await ajustar({ operacao: "ENTRADA", loteId: l.id, quantidade: 10 });
  assert.equal(e.produtoCodigo, p.codigo);
  assert.equal(e.loteNumero, l.numero);
  await ajustar({ operacao: "SAIDA", loteId: l.id, quantidade: 3, observacao: "contagem" });
  await ajustar({ operacao: "PERDA", loteId: l.id, quantidade: 2, observacao: "avaria na caixa" });
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 5);
  const movs = await db.movimento.findMany({ where: { loteId: l.id }, orderBy: { id: "asc" } });
  assert.deepEqual(movs.map((m) => [m.tipo, m.documento, m.quantidade]), [["AJUSTE", "AJUSTE+", 10], ["AJUSTE", "AJUSTE-", 3], ["PERDA", "PERDA", 2]]);
  assert.equal(movs[0].id, e.movimentoId);
  assert.equal(movs[0].origemId, null);
  assert.equal(movs[0].destinoId, LOCAIS.DEPOSITO);
  assert.equal(movs[1].origemId, LOCAIS.DEPOSITO);
  assert.equal(movs[2].observacao, "avaria na caixa");
  assert.equal(movs[2].usuario, "teste");
  await conferirKardex(l.id);
});

test("ajuste: saída ou perda acima do saldo é recusada e não deixa rastro; lote inexistente falha", async () => {
  const p = await mkProduto();
  const l = await mkLote(p.id);
  await ajustar({ operacao: "ENTRADA", loteId: l.id, quantidade: 4 });
  await assert.rejects(ajustar({ operacao: "SAIDA", loteId: l.id, quantidade: 5 }), /Saldo insuficiente.*Dispon[ií]vel: 4/);
  await assert.rejects(ajustar({ operacao: "PERDA", loteId: l.id, quantidade: 5, observacao: "motivo da perda" }), /Saldo insuficiente/);
  await assert.rejects(ajustar({ operacao: "ENTRADA", loteId: "inexistente", quantidade: 1 }));
  assert.equal(await saldoDe(l.id, LOCAIS.DEPOSITO), 4);
  assert.equal(await db.movimento.count({ where: { loteId: l.id } }), 1);
  await conferirKardex(l.id);
});

test("kit: cria, edita, soma item repetido, remove item; código duplicado é recusado", async () => {
  const p1 = await mkProduto();
  const p2 = await mkProduto();
  const codigo = `${P}-KIT-${uid()}`;
  const kit = await db.$transaction((tx) => criarKit(tx, { codigo, descricao: "Kit A" }));
  const ed = await db.$transaction((tx) => editarKit(tx, kit.id, { codigo, descricao: "Kit B" }));
  assert.equal(ed.descricao, "Kit B");
  await assert.rejects(db.$transaction((tx) => criarKit(tx, { codigo, descricao: "dup" })), /Unique constraint/);

  await db.$transaction((tx) => adicionarItemKit(tx, kit.id, { produtoId: p1.id, quantidade: 2 }));
  await db.$transaction((tx) => adicionarItemKit(tx, kit.id, { produtoId: p1.id, quantidade: 3 }));
  const i2 = await db.$transaction((tx) => adicionarItemKit(tx, kit.id, { produtoId: p2.id, quantidade: 1 }));
  const itens = await db.kitItem.findMany({ where: { kitId: kit.id } });
  assert.equal(itens.length, 2);
  assert.equal(itens.find((i) => i.produtoId === p1.id)?.quantidade, 5);

  const rem = await db.$transaction((tx) => removerItemKit(tx, i2.id));
  assert.equal(rem.kitId, kit.id);
  assert.equal(await db.kitItem.count({ where: { kitId: kit.id } }), 1);
});

test("kit: excluir é recusado se usado em remessa; sem uso, exclui com os itens", async () => {
  const p = await mkProduto();
  const hosp = await mkHospital();
  const usado = await db.kit.create({ data: { codigo: `${P}-KIT-${uid()}`, descricao: "usado" } });
  const livre = await db.kit.create({ data: { codigo: `${P}-KIT-${uid()}`, descricao: "livre", itens: { create: { produtoId: p.id, quantidade: 1 } } } });
  const local = { id: await db.$transaction((tx) => localDoHospital(tx, hosp.id)) };
  await db.remessa.create({ data: { localId: local.id, kitId: usado.id } });

  await assert.rejects(db.$transaction((tx) => excluirKit(tx, usado.id)), /Não é possível excluir: usado em 1 remessa\(s\)\./);
  assert.ok(await db.kit.findUnique({ where: { id: usado.id } }));

  const k = await db.$transaction((tx) => excluirKit(tx, livre.id));
  assert.equal(k.codigo, livre.codigo);
  assert.equal(await db.kit.findUnique({ where: { id: livre.id } }), null);
  assert.equal(await db.kitItem.count({ where: { kitId: livre.id } }), 0);
});
