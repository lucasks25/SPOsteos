/** Pendências do sino/painel: contagem por perfil (carregarPendencias). Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { carregarPendencias, listarPendencias } from "@/app/(app)/_painel/pendencias";
import { dia, limparTudo, mkLote, mkProduto, mkFornecedor, P } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

test("quarentena e aprovações aparecem só para o perfil que as enxerga", async () => {
  const antes = { qua: await carregarPendencias("QUALIDADE"), fin: await carregarPendencias("FINANCEIRO"), com: await carregarPendencias("COMERCIAL") };

  const prod = await mkProduto();
  const lote = await mkLote(prod.id, { status: "QUARENTENA" });
  await db.$transaction((tx) => movimentar(tx, { tipo: "ENTRADA", produtoId: prod.id, loteId: lote.id, quantidade: 3, destinoId: LOCAIS.QUARENTENA, documento: `${P}-PEND` }));
  const forn = await mkFornecedor();
  await db.contaPagar.create({ data: { descricao: `${P} conta`, fornecedorId: forn.id, valor: 100, vencimento: dia(60), competencia: dia(60), aprovadoEm: null } });

  const depois = { qua: await carregarPendencias("QUALIDADE"), fin: await carregarPendencias("FINANCEIRO"), com: await carregarPendencias("COMERCIAL") };
  assert.equal(depois.qua.quarentena, antes.qua.quarentena + 1);
  assert.equal(depois.fin.aprovacoes, antes.fin.aprovacoes + 1);
  assert.equal(depois.qua.aprovacoes, 0, "qualidade não vê aprovações");
  assert.equal(depois.fin.quarentena, 0, "financeiro não vê quarentena");
  assert.equal(depois.com.recVencido.qtd, 0, "comercial não vê financeiro");
  assert.ok(listarPendencias(depois.fin).some((p) => p.key === "apr" && p.href === "/financeiro/aprovacoes"));
  assert.ok(listarPendencias(depois.qua).some((p) => p.key === "qua"));
});
