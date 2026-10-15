/** Importação: custo nacionalizado no recebimento, custo médio, contas a pagar, travas e CHECKs. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { custoDoPedido, removerDespesaTx, salvarDadosImportacaoTx, salvarDespesaTx, travarPedido, type DespesaInput } from "@/app/(app)/compras/_lib/importacao-servico";
import { dia, limparTudo, mkFornecedor, mkProduto, num, P, uid } from "./_util";

let fornecedorId: string;
const plano: Record<string, string> = {};
before(async () => {
  await limparTudo();
  fornecedorId = (await mkFornecedor()).id;
  for (const chave of ["ESTOQUE", "TRIBUTOS_RECUPERAR", "CUSTO_IMPORTACAO"]) plano[chave] = (await db.planoConta.findUniqueOrThrow({ where: { chaveSistema: chave } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const receber = (itemId: string, quantidade: number, lote: string) =>
  db.$transaction((tx) => receberItemTx(tx, { itemId, quantidade, lote, validade: dia(365), fabricacao: null, serie: null, usuario: "teste" }));
const despesa = (pedidoId: number, d: Partial<DespesaInput> & Pick<DespesaInput, "tipo" | "valor">, id: string | null = null) =>
  db.$transaction((tx) =>
    salvarDespesaTx(tx, pedidoId, id, { descricao: null, integraCusto: null, criterio: "VALOR", itemId: null, gerarConta: false, fornecedorId: null, vencimento: null, ...d }),
  );
const custoMedio = async (id: string) => num((await db.produto.findUniqueOrThrow({ where: { id } })).custoMedio);

/** Pedido do exemplo conferido à mão em tests/compras/custo-importacao.test.ts (USD, câmbio 5,4321). */
async function pedidoUsd(produtos: string[]) {
  const base = `${P}-${uid()}`;
  const linhas = [
    { quantidade: 10, preco: 12.5, peso: 2.5 },
    { quantidade: 3, preco: 99.99, peso: 1.2 },
    { quantidade: 7, preco: 0.3333, peso: 0.35 },
  ];
  const p = await db.pedidoCompra.create({
    data: {
      fornecedorId,
      importacao: true,
      moeda: "USD",
      cambio: 5.4321,
      tipoCambio: "PTAX",
      itens: { create: linhas.map((l, k) => ({ id: `${base}-${k}`, produtoId: produtos[k], quantidade: l.quantidade, precoMoeda: l.preco, pesoKg: l.peso, custoUnit: Math.round(l.preco * 5.4321 * 100) / 100 })) },
    },
    include: { itens: { orderBy: { id: "asc" } } },
  });
  return { id: p.id, itens: p.itens.map((i) => i.id) };
}

test("recebimento de importação: kardex e custo médio pelo custo nacionalizado, conta do fornecedor só pela mercadoria", async () => {
  const [a, b, c] = [await mkProduto(), await mkProduto(), await mkProduto()];
  // estoque anterior de A: 10 un. a R$ 100,00 (pedido nacional)
  const nac = await db.pedidoCompra.create({ data: { fornecedorId, itens: { create: [{ produtoId: a.id, quantidade: 10, custoUnit: 100 }] } }, include: { itens: true } });
  await receber(nac.itens[0].id, 10, "NAC");
  assert.equal(await custoMedio(a.id), 100);

  const ped = await pedidoUsd([a.id, b.id, c.id]);
  const venc = dia(20);
  const desp = await despesa(ped.id, { tipo: "DESPACHANTE", valor: 1000, criterio: "QUANTIDADE", gerarConta: true, fornecedorId, vencimento: venc });
  await despesa(ped.id, { tipo: "FRETE_INTERNACIONAL", valor: 100 });
  await despesa(ped.id, { tipo: "II", valor: 300, itemId: ped.itens[1] });
  await despesa(ped.id, { tipo: "SEGURO", valor: 10, criterio: "PESO" });
  const icms = await despesa(ped.id, { tipo: "ICMS", valor: 500, gerarConta: true, fornecedorId, vencimento: venc });

  // contas das despesas: integra o custo → ESTOQUE; ICMS recuperável → TRIBUTOS_RECUPERAR; aguardam aprovação
  const cDesp = await db.contaPagar.findUniqueOrThrow({ where: { id: desp.contaPagarId! } });
  assert.equal(cDesp.planoContaId, plano.ESTOQUE);
  assert.equal(num(cDesp.valor), 1000);
  assert.equal(cDesp.aprovadoEm, null);
  assert.equal(cDesp.vencimento.getTime(), venc.getTime());
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: icms.contaPagarId! } })).planoContaId, plano.TRIBUTOS_RECUPERAR);
  assert.equal((await db.pedidoCompraDespesa.findUniqueOrThrow({ where: { id: icms.id } })).integraCusto, false);

  const calc = await db.$transaction(async (tx) => custoDoPedido(await travarPedido(tx, ped.id)));
  assert.deepEqual(calc.linhas.map((l) => l.totalCent), [121443, 215263, 36409]); // mesmo resultado do teste puro

  // A em duas entregas: 4 + 6
  const r1 = await receber(ped.itens[0], 4, "IMP-A");
  assert.equal(r1.valorEstoque, 485.77); // 1.214,43 × 4/10 = 485,772
  assert.equal(r1.valor, 271.6); // fornecedor: 679,01 × 4/10 = 271,604
  assert.equal(r1.custoUnit, 121.44);
  assert.equal(await custoMedio(a.id), 106.13); // (10×100 + 485,77) / 14 = 106,126…
  const r2 = await receber(ped.itens[0], 6, "IMP-A");
  assert.equal(r2.valorEstoque, 728.66); // fecha a linha: 1.214,43 − 485,77
  assert.equal(r2.valor, 407.41); // 679,01 − 271,60
  assert.equal(await custoMedio(a.id), 110.72); // (14×106,13 + 728,66) / 20 = 110,724

  const r3 = await receber(ped.itens[1], 3, "IMP-B");
  assert.equal(r3.valorEstoque, 2152.63);
  assert.equal(await custoMedio(b.id), 717.54);
  const r4 = await receber(ped.itens[2], 3, "IMP-C");
  const r5 = await receber(ped.itens[2], 4, "IMP-C");
  assert.equal(Math.round((r4.valorEstoque + r5.valorEstoque) * 100), 36409);
  assert.equal(r5.completo, true);

  // kardex: custo unitário da entrada = custo nacionalizado (2 casas)
  const mov = await db.movimento.findFirstOrThrow({ where: { produtoId: b.id, documento: `PC-${ped.id}` } });
  assert.equal(num(mov.custoUnit), 717.54);

  // contas do fornecedor (sem as das despesas) somam a mercadoria em reais, no centavo; plano ESTOQUE
  const contas = await db.contaPagar.findMany({ where: { pedidoId: ped.id, despesaImportacao: null } });
  assert.equal(contas.length, 5);
  assert.equal(Math.round(contas.reduce((s, x) => s + num(x.valor), 0) * 100), 232115);
  assert.ok(contas.every((x) => x.planoContaId === plano.ESTOQUE && x.fornecedorId === fornecedorId));
});

test("depois do primeiro recebimento câmbio e despesas ficam travados; dados descritivos continuam editáveis", async () => {
  const prods = [await mkProduto(), await mkProduto(), await mkProduto()];
  const ped = await pedidoUsd(prods.map((p) => p.id));
  const d = await despesa(ped.id, { tipo: "DESPACHANTE", valor: 50, gerarConta: true, fornecedorId, vencimento: dia(10) });
  // antes do recebimento: editar atualiza a conta; trocar câmbio recalcula custoUnit em reais
  await despesa(ped.id, { tipo: "DESPACHANTE", valor: 80, gerarConta: true, fornecedorId, vencimento: dia(15) }, d.id);
  assert.equal(num((await db.contaPagar.findUniqueOrThrow({ where: { id: d.contaPagarId! } })).valor), 80);
  const dados = { moeda: "USD", cambio: 5, tipoCambio: "PTAX" as const, incoterm: "FOB", invoice: "INV-1", numeroDi: null, dataInvoice: null, dataRegistroDi: null, dataDesembaraco: null };
  await db.$transaction((tx) => salvarDadosImportacaoTx(tx, ped.id, dados));
  assert.equal(num((await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: ped.itens[1] } })).custoUnit), 499.95); // 99,99 × 5

  await receber(ped.itens[0], 1, "TRAVA");
  await assert.rejects(despesa(ped.id, { tipo: "SEGURO", valor: 1 }), /primeiro recebimento/);
  await assert.rejects(despesa(ped.id, { tipo: "DESPACHANTE", valor: 90 }, d.id), /primeiro recebimento/);
  await assert.rejects(db.$transaction((tx) => removerDespesaTx(tx, ped.id, d.id)), /primeiro recebimento/);
  await assert.rejects(db.$transaction((tx) => salvarDadosImportacaoTx(tx, ped.id, { ...dados, cambio: 5.1 })), /primeiro recebimento/);
  await db.$transaction((tx) => salvarDadosImportacaoTx(tx, ped.id, { ...dados, numeroDi: "26/0000001-0" }));
  assert.equal((await db.pedidoCompra.findUniqueOrThrow({ where: { id: ped.id } })).numeroDi, "26/0000001-0");
});

test("remover despesa cancela a conta própria; tirar 'gerar conta' também; despesa fora do custo e não tributo vai a 3.03", async () => {
  const prods = [await mkProduto(), await mkProduto(), await mkProduto()];
  const ped = await pedidoUsd(prods.map((p) => p.id));
  const d1 = await despesa(ped.id, { tipo: "ARMAZENAGEM", valor: 40, integraCusto: false, gerarConta: true, fornecedorId, vencimento: dia(5) });
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: d1.contaPagarId! } })).planoContaId, plano.CUSTO_IMPORTACAO);
  await despesa(ped.id, { tipo: "ARMAZENAGEM", valor: 40, integraCusto: false, gerarConta: false }, d1.id);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: d1.contaPagarId! } })).status, "CANCELADO");
  assert.equal((await db.pedidoCompraDespesa.findUniqueOrThrow({ where: { id: d1.id } })).contaPagarId, null);

  const d2 = await despesa(ped.id, { tipo: "AFRMM", valor: 25, gerarConta: true, fornecedorId, vencimento: dia(5) });
  await db.$transaction((tx) => removerDespesaTx(tx, ped.id, d2.id));
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: d2.contaPagarId! } })).status, "CANCELADO");
  assert.equal(await db.pedidoCompraDespesa.count({ where: { id: d2.id } }), 0);

  // conta já baixada não deixa alterar a despesa
  const d3 = await despesa(ped.id, { tipo: "DESPACHANTE", valor: 10, gerarConta: true, fornecedorId, vencimento: dia(5) });
  await db.contaPagar.update({ where: { id: d3.contaPagarId! }, data: { valorBaixado: 10, status: "PAGO" } });
  await assert.rejects(db.$transaction((tx) => removerDespesaTx(tx, ped.id, d3.id)), /já tem baixa/);

  await assert.rejects(despesa(ped.id, { tipo: "OUTRA", valor: 10, gerarConta: true }), /vencimento/);
  await assert.rejects(despesa(ped.id, { tipo: "OUTRA", valor: 10, itemId: "outro-pedido" }), /não pertence/);
});

test("recebimento recusa importação sem preço na moeda; CHECKs do banco", async () => {
  const prod = await mkProduto();
  const p = await db.pedidoCompra.create({ data: { fornecedorId, importacao: true, moeda: "EUR", cambio: 6, itens: { create: [{ produtoId: prod.id, quantidade: 2, custoUnit: 10 }] } }, include: { itens: true } });
  await assert.rejects(receber(p.itens[0].id, 1, "SEMPRECO"), /preço na moeda/);
  assert.equal((await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: p.itens[0].id } })).recebido, 0);

  const base = { fornecedorId, importacao: true };
  await assert.rejects(db.pedidoCompra.create({ data: { ...base, moeda: "usd", cambio: 5 } }), /PedidoCompra_moeda_check/);
  await assert.rejects(db.pedidoCompra.create({ data: { ...base, moeda: "USD", cambio: 0 } }), /PedidoCompra_cambio_check/);
  await assert.rejects(db.pedidoCompra.create({ data: { ...base, moeda: "USD" } }), /PedidoCompra_moeda_cambio_check/);
  await assert.rejects(db.pedidoCompra.create({ data: { fornecedorId, moeda: "USD", cambio: 5 } }), /PedidoCompra_nacional_brl_check/);
  await assert.rejects(db.pedidoCompraDespesa.create({ data: { pedidoId: p.id, tipo: "OUTRA", valor: -1, integraCusto: true } }), /PedidoCompraDespesa_valor_check/);
});

test("despesa incluída ao mesmo tempo que o recebimento: ou entra no custo, ou é recusada (trava do pedido)", async () => {
  for (let rodada = 0; rodada < 3; rodada++) {
    const prods = [await mkProduto(), await mkProduto(), await mkProduto()];
    const ped = await pedidoUsd(prods.map((p) => p.id));
    const [rec, dsp] = await Promise.allSettled([receber(ped.itens[0], 10, `CONC${rodada}`), despesa(ped.id, { tipo: "FRETE_INTERNACIONAL", valor: 999.99 })]);
    assert.equal(rec.status, "fulfilled");
    const salvas = await db.pedidoCompraDespesa.count({ where: { pedidoId: ped.id } });
    assert.equal(salvas, dsp.status === "fulfilled" ? 1 : 0);
    const calc = await db.$transaction(async (tx) => custoDoPedido(await travarPedido(tx, ped.id)));
    // o que entrou no estoque é exatamente o custo calculado com as despesas que existem no fim
    assert.equal(Math.round((rec as PromiseFulfilledResult<{ valorEstoque: number }>).value.valorEstoque * 100), calc.linhas[0].totalCent);
  }
});
