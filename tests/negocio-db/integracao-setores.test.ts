/**
 * Integração entre setores, ponta a ponta (docs/INTEGRACAO-SETORES.md): cada teste dispara uma cadeia só pelos serviços
 * públicos/transacionais (sem login) e confere, com números feitos à mão, o reflexo em estoque, financeiro (título,
 * caixa, DRE, fluxo), comercial, qualidade e painel. Toda cadeia termina nas invariantes globais (_invariantes.ts).
 * Cadeias de estoque (inventário, recolhimento, ajuste) em integracao-estoque.test.ts; fechamento de mês em
 * integracao-fechamento.test.ts. Rode com `npm run test:db` (sob o lock do banco de teste).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, type Tx } from "@/lib/db";
import { hojeSP, hojeUTC } from "@/lib/datas";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { salvarDespesaTx } from "@/app/(app)/compras/_lib/importacao-servico";
import { inspecionarLoteServico } from "@/app/(app)/qualidade/_lib/inspecao-servico";
import { conferirRemessa, criarRemessa, enviarRemessa, cancelarRemessa, lotesDisponiveis } from "@/app/(app)/estoque/_lib/remessas";
import { sugerirFefo } from "@/app/(app)/estoque/_lib/fefo";
import { contarCirurgiasAguardandoVale } from "@/app/(app)/estoque/_lib/publico";
import { cancelarCirurgiaTx, confirmarCirurgiaTx, salvarCirurgiaTx } from "@/app/(app)/comercial/_lib/cirurgia-servico";
import { registrarConsumoDiretoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { faturarCirurgia } from "@/app/(app)/comercial/_lib/faturamento";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { contarAFaturar, contarPedidosSemNf, indicadoresComerciais, proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";
import { aprovarContasPagarTx } from "@/app/(app)/financeiro/_lib/aprovacao-servico";
import { aplicarRetornoTx, contagemVazia, gerarRemessaDaContaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { estornarTransferencia, registrarBaixa, registrarGlosa, registrarRecurso, transferir } from "@/app/(app)/financeiro/_lib/titulos";
import { gerarContaReceberTx } from "@/app/(app)/financeiro/_lib/publico";
import { carregarPendencias, listarPendencias } from "@/app/(app)/_painel/pendencias";
import { dia, mkFornecedor, mkHospital, mkProduto, num, P, saldoDe, uid } from "./_util";
import { deltaDre, fotoDre, limparIntegracao, mkConta, painelMes, r2, realizadoHoje, recusa, saldoConta, tx } from "./_integracao";
import { conferirTudo } from "./_invariantes";

let contaId: string, caixaId: string, fornecedorId: string, hospitalId: string, medicoId: string, representanteId: string;

before(async () => {
  await limparIntegracao();
  contaId = (await mkConta()).id;
  caixaId = (await mkConta({ tipo: "CAIXA" })).id;
  fornecedorId = (await mkFornecedor()).id;
  await db.fornecedor.update({ where: { id: fornecedorId }, data: { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" } });
  hospitalId = (await mkHospital()).id;
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  representanteId = (await db.representante.create({ data: { nome: `${P} representante`, comissaoPercent: 5 } })).id;
});
after(async () => {
  await limparIntegracao();
  await db.$disconnect();
});

const receber = (itemId: string, quantidade: number, lote: string, validadeDias: number) =>
  tx((t) => receberItemTx(t, { itemId, quantidade, lote, validade: dia(validadeDias), fabricacao: null, serie: null, usuario: "teste" }));
const liberar = (loteId: string) => tx((t) => inspecionarLoteServico(t, loteId, { resultado: "LIBERADO", embalagemOk: true, rotulagemOk: true, documentacaoOk: true, inspetor: "teste" }));
const loteDe = (produtoId: string, numero: string) => db.lote.findUniqueOrThrow({ where: { produtoId_numero: { produtoId, numero } } });
const custoMedio = async (id: string) => num((await db.produto.findUniqueOrThrow({ where: { id } })).custoMedio);
const novaCirurgia = (o: { dias?: number } = {}) =>
  tx((t) => salvarCirurgiaTx(t, null, { dataHora: new Date(hojeSP().getTime() + (o.dias ?? 1) * 86400000 + 13 * 3600000), hospitalId, medicoId, representanteId, paciente: `${P} paciente ${uid()}`, sus: false })).then((r) => r.cirurgia);

test("(i) importação de 2 itens: recebimento → quarentena + custo nacionalizado + contas aguardando aprovação → inspeção → aprovação → SISPAG → retorno: caixa, DRE e estoque fecham", async () => {
  const [a, b] = [await mkProduto(), await mkProduto()];
  const [dre0, fluxo0, painel0] = [await fotoDre(), await realizadoHoje(), await painelMes()];
  const [pq0, pf0] = [await carregarPendencias("QUALIDADE"), await carregarPendencias("FINANCEIRO")];
  // USD, câmbio 5: A = 10 × US$ 20 = R$ 1.000; B = 5 × US$ 40 = R$ 1.000
  const base = `${P}-${uid()}`;
  const ped = await db.pedidoCompra.create({
    data: { fornecedorId, importacao: true, moeda: "USD", cambio: 5, tipoCambio: "PTAX", itens: { create: [
      { id: `${base}-0`, produtoId: a.id, quantidade: 10, precoMoeda: 20, custoUnit: 100 },
      { id: `${base}-1`, produtoId: b.id, quantidade: 5, precoMoeda: 40, custoUnit: 200 },
    ] } },
  });
  const desp = { descricao: null, integraCusto: null, itemId: null, gerarConta: true, fornecedorId, vencimento: dia(15) } as const;
  // frete R$ 400 integra o custo, rateado por valor (1.000 : 1.000 → 200 + 200); ICMS R$ 100 recuperável, fora do custo
  await tx((t) => salvarDespesaTx(t, ped.id, null, { ...desp, tipo: "FRETE_INTERNACIONAL", valor: 400, criterio: "VALOR" }));
  await tx((t) => salvarDespesaTx(t, ped.id, null, { ...desp, tipo: "ICMS", valor: 100, criterio: "VALOR" }));

  const la = `IA${uid()}`, lb = `IB${uid()}`;
  await receber(`${base}-0`, 10, la, 400);
  await receber(`${base}-1`, 5, lb, 300);
  const [loteA, loteB] = [await loteDe(a.id, la), await loteDe(b.id, lb)];

  // qualidade: lote novo em quarentena; estoque: entrada na quarentena pelo custo nacionalizado (1.200/10 e 1.200/5)
  assert.deepEqual([loteA.status, loteB.status], ["QUARENTENA", "QUARENTENA"]);
  assert.deepEqual([await saldoDe(loteA.id, LOCAIS.QUARENTENA), await saldoDe(loteB.id, LOCAIS.QUARENTENA)], [10, 5]);
  const entradas = await db.movimento.findMany({ where: { loteId: { in: [loteA.id, loteB.id] }, tipo: "ENTRADA" }, orderBy: { quantidade: "desc" } });
  assert.deepEqual(entradas.map((m) => [num(m.custoUnit), m.documento]), [[120, `PC-${ped.id}`], [240, `PC-${ped.id}`]]);
  assert.deepEqual([await custoMedio(a.id), await custoMedio(b.id)], [120, 240]);
  assert.equal((await db.pedidoCompra.findUniqueOrThrow({ where: { id: ped.id } })).status, "RECEBIDO");

  // financeiro: 2 contas da mercadoria (1.000 cada) + frete 400 em ESTOQUE; ICMS 100 em tributos a recuperar; todas aguardando aprovação
  const contas = await db.contaPagar.findMany({ where: { pedidoId: ped.id }, include: { planoConta: true }, orderBy: { valor: "asc" } });
  assert.deepEqual(contas.map((c) => [num(c.valor), c.planoConta?.chaveSistema, c.aprovadoEm]), [[100, "TRIBUTOS_RECUPERAR", null], [400, "ESTOQUE", null], [1000, "ESTOQUE", null], [1000, "ESTOQUE", null]]);
  const valorEstoque = 10 * 120 + 5 * 240;
  const contasEstoque = contas.filter((c) => c.planoConta?.chaveSistema === "ESTOQUE").reduce((s, c) => s + num(c.valor), 0);
  assert.equal(valorEstoque, contasEstoque, "o valor do estoque recebido (2.400) fecha com as contas a pagar lançadas em ESTOQUE");
  const dre1 = deltaDre(dre0, await fotoDre());
  assert.deepEqual([dre1.resultado, dre1.chave("ESTOQUE"), dre1.chave("TRIBUTOS_RECUPERAR")], [0, -2400, -100], "compra fica fora do resultado");

  // painel/sino: quarentena para a qualidade, aprovações para o financeiro
  const [pq1, pf1] = [await carregarPendencias("QUALIDADE"), await carregarPendencias("FINANCEIRO")];
  assert.deepEqual([pq1.quarentena - pq0.quarentena, pf1.aprovacoes - pf0.aprovacoes], [2, 4]);
  assert.equal((await tx((t) => lotesDisponiveis(t, { produtoIds: [a.id, b.id] }))).length, 0, "quarentena não entra no FEFO");

  // inspeção aprova: quarentena → depósito, lote LIBERADO e disponível para vale
  await liberar(loteA.id);
  await liberar(loteB.id);
  assert.deepEqual([await saldoDe(loteA.id, LOCAIS.DEPOSITO), await saldoDe(loteB.id, LOCAIS.DEPOSITO), await saldoDe(loteA.id, LOCAIS.QUARENTENA)], [10, 5, 0]);
  assert.deepEqual((await tx((t) => lotesDisponiveis(t, { produtoIds: [a.id, b.id] }))).map((l) => l.disponivel).sort((x, y) => x - y), [5, 10]);
  assert.equal((await carregarPendencias("QUALIDADE")).quarentena, pq0.quarentena);

  // SISPAG: sem aprovação é recusado; aprovadas, a remessa leva as 4 e o retorno pago baixa tudo
  const ids = contas.map((c) => c.id);
  const remessa = (t: Tx) => gerarRemessaDaContaTx(t, { contaId, modo: "TED_BOLETO", dataPagto: dia(0), ids });
  assert.match(await recusa(tx(remessa)), /aguardando aprovação/);
  assert.equal(await tx((t) => aprovarContasPagarTx(t, ids, "aprovador-teste")), 4);
  assert.equal((await carregarPendencias("FINANCEIRO")).aprovacoes, pf0.aprovacoes);
  const rem = await tx(remessa);
  assert.equal(r2(rem.total), 2500);
  const itens = await db.remessaPagamentoItem.findMany({ where: { remessaId: rem.remessaId } });
  await tx((t) => aplicarRetornoTx(t, itens.map((i) => ({ seuNumero: `SP${i.id}`, segmento: "A" as const, ocorrencias: ["00"], nossoNumero: "", dataEfetiva: dia(0), valorEfetivo: num(i.valor) })), contagemVazia()));

  assert.deepEqual((await db.contaPagar.findMany({ where: { id: { in: ids } } })).map((c) => c.status), ["PAGO", "PAGO", "PAGO", "PAGO"]);
  assert.equal(await saldoConta(contaId), -2500, "caixa baixou 2.400 da mercadoria + frete e 100 do ICMS");
  const [fluxo1, painel1, dre2] = [await realizadoHoje(), await painelMes(), deltaDre(dre0, await fotoDre())];
  assert.equal(r2(fluxo1.saidas - fluxo0.saidas), 2500, "realizado do fluxo");
  assert.equal(r2(painel1.saidas - painel0.saidas), 2500, "saídas do mês no painel");
  assert.deepEqual([dre2.resultado, dre2.financeiro], [0, 0], "pagar mercadoria não é despesa: o custo vai ao resultado só pelo CMV, na venda");
  await conferirTudo();
});

test("(ii) cirurgia: compra nacional (mesmo caminho da conta a pagar) → vale FEFO → envio → conferência com consumo e devolução → faturar → NF → baixa com juros: DRE receita, CMV, juros e margem", async () => {
  const [p1, p2] = [await mkProduto({ precoBase: 300 }), await mkProduto({ precoBase: 500 })];
  const ped = await db.pedidoCompra.create({ data: { fornecedorId, itens: { create: [{ produtoId: p1.id, quantidade: 10, custoUnit: 100 }, { produtoId: p2.id, quantidade: 4, custoUnit: 200 }] } }, include: { itens: true } });
  const it1 = ped.itens.find((i) => i.produtoId === p1.id)!.id, it2 = ped.itens.find((i) => i.produtoId === p2.id)!.id;
  const [n1a, n1b, n2] = [`A${uid()}`, `B${uid()}`, `C${uid()}`];
  await receber(it1, 6, n1a, 200); // vence primeiro
  await receber(it1, 4, n1b, 400);
  await receber(it2, 4, n2, 300);
  // nacional: mesmo caminho da importação (G10): ESTOQUE, aguardando aprovação, recusada no SISPAG até aprovar
  const cps = await db.contaPagar.findMany({ where: { pedidoId: ped.id }, include: { planoConta: true }, orderBy: { valor: "asc" } });
  assert.deepEqual(cps.map((c) => [num(c.valor), c.planoConta?.chaveSistema, c.categoria, c.aprovadoEm]), [[400, "ESTOQUE", "Compra de mercadoria", null], [600, "ESTOQUE", "Compra de mercadoria", null], [800, "ESTOQUE", "Compra de mercadoria", null]]);
  assert.match(await recusa(tx((t) => gerarRemessaDaContaTx(t, { contaId, modo: "TED_BOLETO", dataPagto: dia(0), ids: cps.map((c) => c.id) }))), /aguardando aprovação/);
  const [l1a, l1b, l2] = [await loteDe(p1.id, n1a), await loteDe(p1.id, n1b), await loteDe(p2.id, n2)];
  for (const l of [l1a, l1b, l2]) await liberar(l.id);
  assert.deepEqual([await custoMedio(p1.id), await custoMedio(p2.id)], [100, 200]);

  // comercial agenda → estoque vê a cirurgia sem vale (fila + sino)
  const [vale0, pe0] = [await contarCirurgiasAguardandoVale(hojeSP()), await carregarPendencias("ESTOQUE")];
  const cir = await novaCirurgia();
  assert.equal(await contarCirurgiasAguardandoVale(hojeSP()), vale0 + 1);
  const pe1 = await carregarPendencias("ESTOQUE");
  assert.equal(pe1.semVale, pe0.semVale + 1);
  assert.ok(listarPendencias(pe1).some((p) => p.key === "vale" && p.href === "/estoque/remessas"));

  // vale por FEFO: 8 de P1 = 6 do lote que vence primeiro + 2 do seguinte; 2 de P2
  const disp = await tx((t) => lotesDisponiveis(t, { produtoIds: [p1.id, p2.id] }));
  const f1 = sugerirFefo(disp, p1.id, 8), f2 = sugerirFefo(disp, p2.id, 2);
  assert.deepEqual(f1.linhas.map((l) => [l.loteId, l.quantidade]), [[l1a.id, 6], [l1b.id, 2]]);
  const rem = await tx((t) => criarRemessa(t, { hospitalId, cirurgiaId: cir.id, itens: [...f1.linhas, ...f2.linhas] }));
  assert.equal(await contarCirurgiasAguardandoVale(hojeSP()), vale0);
  assert.equal((await proximasCirurgias(hojeSP(), 500)).find((c) => c.id === cir.id)?.temVale, true);

  // envio: depósito → consignado do hospital
  const local = await tx((t) => localDoHospital(t, hospitalId));
  const rc0 = (await carregarPendencias("ESTOQUE")).remessas;
  await tx((t) => enviarRemessa(t, rem.id, "teste"));
  assert.deepEqual([await saldoDe(l1a.id, local), await saldoDe(l1b.id, local), await saldoDe(l2.id, local)], [6, 2, 2]);
  assert.deepEqual([await saldoDe(l1a.id, LOCAIS.DEPOSITO), await saldoDe(l1b.id, LOCAIS.DEPOSITO), await saldoDe(l2.id, LOCAIS.DEPOSITO)], [0, 2, 2]);
  assert.equal((await carregarPendencias("ESTOQUE")).remessas, rc0 + 1);

  // conferência: P1 lote A 5 consumidos + 1 devolvido; lote B 2 devolvidos; P2 1 consumido e 1 fica consignado
  const dre0 = await fotoDre();
  const aFat0 = await contarAFaturar();
  const ri = await db.remessaItem.findMany({ where: { remessaId: rem.id } });
  const item = (loteId: string) => ri.find((i) => i.loteId === loteId)!.id;
  await tx((t) => conferirRemessa(t, rem.id, [{ itemId: item(l1a.id), devolvido: 1, consumido: 5 }, { itemId: item(l1b.id), devolvido: 2, consumido: 0 }, { itemId: item(l2.id), devolvido: 0, consumido: 1 }], "teste"));
  assert.deepEqual([await saldoDe(l1a.id, LOCAIS.DEPOSITO), await saldoDe(l1b.id, LOCAIS.DEPOSITO), await saldoDe(l2.id, LOCAIS.DEPOSITO)], [1, 4, 2]);
  assert.deepEqual([await saldoDe(l1a.id, local), await saldoDe(l1b.id, local), await saldoDe(l2.id, local)], [0, 0, 1]);
  const cirR = await db.cirurgia.findUniqueOrThrow({ where: { id: cir.id }, include: { consumos: true } });
  assert.equal(cirR.status, "REALIZADA");
  assert.deepEqual(cirR.consumos.map((c) => [c.loteId, c.quantidade]).sort(), [[l1a.id, 5], [l2.id, 1]].sort());
  assert.equal(await contarAFaturar(), aFat0 + 1);
  assert.equal(deltaDre(dre0, await fotoDre()).resultado, 0, "consumo não é resultado: o custo entra pelo CMV com a NF");

  // faturar: 5 × 300 + 1 × 500 = 2.000; custo 5 × 100 + 1 × 200 = 700; comissão 5% = 100
  const [nf0, pc0] = [await contarPedidosSemNf(), await carregarPendencias("COMERCIAL")];
  const pv = await tx((t) => faturarCirurgia(t, cir.id));
  assert.deepEqual([num(pv.total), num(pv.custoTotal), num(pv.comissao)], [2000, 700, 100]);
  assert.equal((await db.cirurgia.findUniqueOrThrow({ where: { id: cir.id } })).status, "FATURADA");
  assert.deepEqual([await contarAFaturar(), await contarPedidosSemNf()], [aFat0, nf0 + 1]);
  const pc1 = await carregarPendencias("COMERCIAL");
  assert.equal(pc1.pedidosSemNf, pc0.pedidosSemNf + 1);
  assert.ok(listarPendencias(pc1).some((p) => p.key === "nf"));
  assert.equal((await carregarPendencias("FINANCEIRO")).pedidosSemNf, pc1.pedidosSemNf, "o financeiro também vê o faturamento pendente");

  // NF: conta a receber na competência; baixa de 2.030 com 30 de juros
  const [ind0, painel0, fluxo0] = [await indicadoresComerciais(hojeSP()), await painelMes(), await realizadoHoje()];
  const cr = await tx((t) => registrarNfTx(t, pv.id, `${P}${uid()}`, dia(30)));
  const crp = await db.contaReceber.findUniqueOrThrow({ where: { id: cr.id }, include: { planoConta: true } });
  assert.deepEqual([num(crp.valor), crp.planoConta?.chaveSistema, crp.competencia.getTime(), crp.hospitalId], [2000, "RECEITA_VENDA", hojeUTC().getTime(), hospitalId]);
  assert.equal(await contarPedidosSemNf(), nf0);
  assert.equal(r2((await painelMes()).receber - painel0.receber), 2000, "a receber em aberto no painel do financeiro");
  await tx((t) => registrarBaixa(t, { tipo: "receber", tituloId: cr.id, contaId, data: dia(0), valor: 2030, juros: 30 }));
  const quitado = await db.contaReceber.findUniqueOrThrow({ where: { id: cr.id } });
  assert.deepEqual([quitado.status, num(quitado.valorPago), num(quitado.valorBaixado)], ["PAGO", 2030, 2000]);
  assert.equal(r2((await realizadoHoje()).entradas - fluxo0.entradas), 2030);

  const d = deltaDre(dre0, await fotoDre());
  assert.deepEqual([d.receitaBruta, d.custos, d.lucroBruto, d.financeiro, d.resultado], [2000, -700, 1300, 30, 1330]);
  assert.deepEqual([d.chave("RECEITA_VENDA"), d.chave("CMV"), d.chave("JUROS_RECEBIDOS")], [2000, -700, 30]);
  assert.equal(d.lucroBruto, r2(d.receitaBruta + d.custos), "margem bruta = receita − CMV");
  const ind1 = await indicadoresComerciais(hojeSP());
  assert.deepEqual([r2(ind1.vendidoMes - ind0.vendidoMes), r2(ind1.margemMes - ind0.margemMes), ind1.notasMes - ind0.notasMes], [2000, 1300, 1]);
  await conferirTudo();
});

test("(ii-b) vale não conferido bloqueia o faturamento (G4) e vale de cirurgia cancelada não sai do depósito (G5)", async () => {
  const p = await mkProduto({ custoMedio: 40, precoBase: 90 });
  const lote = await db.lote.create({ data: { produtoId: p.id, numero: `V${uid()}`, validade: dia(300), status: "LIBERADO" } });
  await tx((t) => movimentar(t, { tipo: "ENTRADA", produtoId: p.id, loteId: lote.id, quantidade: 5, destinoId: LOCAIS.DEPOSITO, custoUnit: 40 }));
  const cir = await novaCirurgia();
  await tx((t) => confirmarCirurgiaTx(t, cir.id));
  const rem = await tx((t) => criarRemessa(t, { hospitalId, cirurgiaId: cir.id, itens: [{ produtoId: p.id, loteId: lote.id, quantidade: 2 }] }));
  await tx((t) => enviarRemessa(t, rem.id, "teste"));
  await tx((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: lote.id, quantidade: 1, usuario: "teste" }));
  assert.match(await recusa(tx((t) => faturarCirurgia(t, cir.id))), new RegExp(`REM-${rem.id}.*conferir`));
  const ri = await db.remessaItem.findFirstOrThrow({ where: { remessaId: rem.id } });
  await tx((t) => conferirRemessa(t, rem.id, [{ itemId: ri.id, devolvido: 1, consumido: 0 }], "teste"));
  const pv = await tx((t) => faturarCirurgia(t, cir.id));
  assert.deepEqual([num(pv.total), num(pv.custoTotal)], [90, 40]);

  const c2 = await novaCirurgia({ dias: 2 });
  const r2v = await tx((t) => criarRemessa(t, { hospitalId, cirurgiaId: c2.id, itens: [{ produtoId: p.id, loteId: lote.id, quantidade: 1 }] }));
  await tx((t) => cancelarCirurgiaTx(t, c2.id));
  const dep = await saldoDe(lote.id, LOCAIS.DEPOSITO);
  assert.match(await recusa(tx((t) => enviarRemessa(t, r2v.id, "teste"))), /cancelada/);
  assert.deepEqual([(await db.remessa.findUniqueOrThrow({ where: { id: r2v.id } })).status, await saldoDe(lote.id, LOCAIS.DEPOSITO)], ["ABERTA", dep]);
  await tx((t) => cancelarRemessa(t, r2v.id));
  await conferirTudo();
});

test("(iii) glosa e recurso revertido: dedução sai do DRE, título reabre, a receber volta e o caixa fecha em 1.000", async () => {
  const [dre0, painel0] = [await fotoDre(), await painelMes()];
  const t0 = await tx((t) => gerarContaReceberTx(t, { descricao: `${P} NF glosa`, hospitalId, pedidoId: null, valor: 1000, vencimento: dia(20), competencia: dia(0), centroCustoId: null, chavePlano: "RECEITA_VENDA" }));
  const g = await tx((t) => registrarGlosa(t, { tituloId: t0.id, valor: 200, data: dia(0), motivo: `${P} sem autorização`, categoria: "SEM_AUTORIZACAO" }));
  let d = deltaDre(dre0, await fotoDre());
  assert.deepEqual([d.receitaBruta, d.deducoes, d.receitaLiquida, d.chave("GLOSA")], [1000, -200, 800, -200]);
  assert.equal(r2((await painelMes()).receber - painel0.receber), 800, "a receber em aberto já sem a glosa");

  await tx((t) => registrarBaixa(t, { tipo: "receber", tituloId: t0.id, contaId, data: dia(0), valor: 800 }));
  assert.equal((await db.contaReceber.findUniqueOrThrow({ where: { id: t0.id } })).status, "PAGO");
  await tx((t) => registrarRecurso(t, g.id, "RECORRER", dia(0)));
  assert.equal(deltaDre(dre0, await fotoDre()).chave("GLOSA"), -200, "recorrer não muda o DRE");

  await tx((t) => registrarRecurso(t, g.id, "REVERTER", dia(0)));
  const reaberto = await db.contaReceber.findUniqueOrThrow({ where: { id: t0.id } });
  assert.deepEqual([reaberto.status, num(reaberto.valorBaixado)], ["ABERTO", 800]);
  d = deltaDre(dre0, await fotoDre());
  assert.deepEqual([d.deducoes, d.receitaLiquida, d.chave("GLOSA")], [0, 1000, 0]);
  assert.equal(r2((await painelMes()).receber - painel0.receber), 200, "o hospital volta a dever 200");

  const caixa0 = await saldoConta(contaId);
  await tx((t) => registrarBaixa(t, { tipo: "receber", tituloId: t0.id, contaId, data: dia(0), valor: 200 }));
  assert.equal((await db.contaReceber.findUniqueOrThrow({ where: { id: t0.id } })).status, "PAGO");
  assert.equal(r2((await saldoConta(contaId)) - caixa0), 200);
  assert.equal(num((await db.lancamento.aggregate({ where: { contaReceberId: t0.id }, _sum: { valor: true } }))._sum.valor), 1000, "caixa total = valor da NF");
  assert.equal(deltaDre(dre0, await fotoDre()).resultado, 1000);
  await conferirTudo();
});

test("(vii) transferência: muda o saldo de cada conta, não muda DRE, realizado do fluxo, entradas/saídas nem saldo total", async () => {
  const [dre0, fluxo0, painel0, a0, b0] = [await fotoDre(), await realizadoHoje(), await painelMes(), await saldoConta(contaId), await saldoConta(caixaId)];
  const t = await tx((x) => transferir(x, { origemId: contaId, destinoId: caixaId, valor: 321.09, data: dia(0), descricao: `${P} sangria` }));
  assert.deepEqual([r2((await saldoConta(contaId)) - a0), r2((await saldoConta(caixaId)) - b0)], [-321.09, 321.09]);
  const [dre1, fluxo1, painel1] = [await fotoDre(), await realizadoHoje(), await painelMes()];
  assert.equal(deltaDre(dre0, dre1).resultado, 0);
  assert.deepEqual(fluxo1, fluxo0);
  assert.deepEqual([painel1.entradas, painel1.saidas, painel1.saldoTotal], [painel0.entradas, painel0.saidas, painel0.saldoTotal]);
  await tx((x) => estornarTransferencia(x, t.id));
  assert.deepEqual([await saldoConta(contaId), await saldoConta(caixaId)], [a0, b0]);
  await conferirTudo();
});
