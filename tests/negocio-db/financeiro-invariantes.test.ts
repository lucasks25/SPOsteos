/**
 * Revisão de consistência financeira (16/10/2026): invariantes globais (auditoria de dados) e um teste por suspeita.
 * Teste que FALHA prova um defeito (o nome começa com "BUG"); teste que passa prova que a regra está certa.
 * Dados com prefixo TESTEDB; tudo que é criado é apagado no fim. Rode com `npm run test:db` (sob o lock do banco de teste).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { addMeses, hojeUTC, inicioMes } from "@/lib/datas";
import { localDoHospital, movimentar } from "@/lib/estoque";
import { estornarGlosa, registrarBaixa, registrarGlosa, registrarRecurso, transferir } from "@/app/(app)/financeiro/_lib/titulos";
import { baixarEConciliarTx, conciliarComLancamentoTx, importarExtratoTexto } from "@/app/(app)/financeiro/_lib/conciliacao-servico";
import { aplicarRetornoTx, contagemVazia, gerarRemessaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { cancelarTituloTx, salvarContaPagarTx, salvarContaReceberTx } from "@/app/(app)/financeiro/_lib/titulos-servico";
import { aprovarContasPagarTx } from "@/app/(app)/financeiro/_lib/aprovacao-servico";
import { lancarAvulsoTx } from "@/app/(app)/financeiro/_lib/contas-servico";
import { alterarContaPagarGeradaTx, gerarContaPagarTx } from "@/app/(app)/financeiro/_lib/publico";
import { listarContas } from "@/app/(app)/financeiro/_lib/contas";
import { calcularFluxo } from "@/app/(app)/financeiro/_lib/fluxo";
import { carregarLinhasDre } from "@/app/(app)/financeiro/_lib/dre-dados";
import { registrarConsumoDiretoTx, removerConsumoTx } from "@/app/(app)/comercial/_lib/consumo-servico";
import { concluirContagem, criarInventario, fecharInventario, salvarContagem } from "@/app/(app)/estoque/_lib/inventario-servico";
import { dia, limparTudo, mkFornecedor, mkHospital, mkLote, mkProduto, num, P, uid } from "./_util";

type T = Parameters<Parameters<typeof db.$transaction>[0]>[0];
const OPC = { timeout: 20_000, maxWait: 10_000 };
const tx = <R>(f: (t: T) => Promise<R>) => db.$transaction(f, OPC);
const r2 = (n: number) => Math.round(n * 100) / 100;
const cent = (n: number) => Math.round(n * 100);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MES_FECHADO = "2023-03";
const DIA_FECHADO = new Date("2023-03-10T00:00:00Z");
let mesJaFechado = false;
let conta: { id: string; titularCnpj: string; titularNome: string; agencia: string };
let contaB: string;
const cd = { conta: "12345", dac: "6" };
let hospitalId: string, fornecedorId: string, planoDespesa: string;

async function limpar() {
  const contas = (await db.contaBancaria.findMany({ where: { nome: { startsWith: P } }, select: { id: true } })).map((c) => c.id);
  await db.extratoLinha.deleteMany({ where: { contaId: { in: contas } } });
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: contas } }, { descricao: { startsWith: P } }] } });
  await db.transferencia.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.remessaPagamento.deleteMany({ where: { contaId: { in: contas } } });
  await limparTudo();
  await db.contaBancaria.deleteMany({ where: { id: { in: contas } } });
}

before(async () => {
  await limpar();
  mesJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_FECHADO } }));
  const c = await db.contaBancaria.create({ data: { nome: `${P} inv A`, tipo: "BANCO", banco: "341", agencia: "1234", numero: "123456", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", saldoInicial: 0 } });
  conta = { id: c.id, titularCnpj: c.titularCnpj!, titularNome: c.titularNome!, agencia: c.agencia! };
  contaB = (await db.contaBancaria.create({ data: { nome: `${P} inv B`, tipo: "CAIXA", saldoInicial: 0 } })).id;
  hospitalId = (await mkHospital()).id;
  fornecedorId = (await mkFornecedor()).id;
  await db.fornecedor.update({ where: { id: fornecedorId }, data: { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" } });
  planoDespesa = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4.02" } })).id;
});
after(async () => {
  if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  await limpar();
  await db.$disconnect();
});

async function comMesFechado<R>(f: () => Promise<R>) {
  if (!mesJaFechado) await db.fechamentoMes.create({ data: { mes: MES_FECHADO } });
  try {
    return await f();
  } finally {
    if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  }
}

/**
 * Transação que executa `f` e só faz commit quando `liberar()` é chamado: permite provar corridas de forma determinística
 * (a outra transação lê o estado anterior ao commit e fica bloqueada na trava de linha que esta segura).
 */
function txPausada<R>(f: (t: T) => Promise<R>) {
  let liberar!: () => void;
  let pronto!: () => void;
  const portao = new Promise<void>((r) => (liberar = r));
  const executou = new Promise<void>((r) => (pronto = r));
  const p = db.$transaction(async (t) => {
    const r = await f(t);
    pronto();
    await portao;
    return r;
  }, OPC);
  p.catch(() => pronto());
  return { p, executou, liberar };
}

/** A executa e segura o commit; B começa (lê o estado antigo) e fica na trava; A faz commit; B termina. */
async function corrida<RA, RB>(a: (t: T) => Promise<RA>, b: (t: T) => Promise<RB>) {
  const A = txPausada(a);
  await A.executou;
  const pB = tx(b);
  await espera(800);
  A.liberar();
  return Promise.allSettled([A.p, pB]);
}

const receber = (valor: number, o: { vencimento?: Date } = {}) =>
  db.contaReceber.create({ data: { descricao: `${P} receber`, valor, vencimento: o.vencimento ?? dia(5), competencia: dia(0), hospitalId } });
const pagar = (valor: number, o: { aprovado?: boolean; competencia?: Date } = {}) =>
  db.contaPagar.create({ data: { descricao: `${P} pagar`, valor, vencimento: dia(5), competencia: o.competencia ?? dia(0), fornecedorId, planoContaId: planoDespesa, aprovadoEm: o.aprovado === false ? null : new Date() } });
const linhaExtrato = (valor: number, data = dia(0)) =>
  db.extratoLinha.create({ data: { contaId: conta.id, data, valor, descricao: `${P} extrato`, fitid: `${P}-${uid()}` } });
const gerar = (ids: string[]) => tx((t) => gerarRemessaTx(t, { conta, cd, modo: "TED_BOLETO", dataPagto: dia(0), ids }));
const retornoPago = (itemId: number, valor: number, data = dia(0)) => [{ seuNumero: `SP${itemId}`, segmento: "A" as const, ocorrencias: ["00"], nossoNumero: "", dataEfetiva: data, valorEfetivo: valor }];
const somaLanc = async (where: object) => num((await db.lancamento.aggregate({ where, _sum: { valor: true } }))._sum.valor);

async function linhaDreMes(chave: "PERDA_ESTOQUE") {
  const ini = inicioMes(hojeUTC());
  const id = (await db.planoConta.findFirstOrThrow({ where: { chaveSistema: chave } })).id;
  const linhas = await carregarLinhasDre(ini, addMeses(ini, 1), null);
  return r2(linhas.filter((l) => l.planoId === id).reduce((s, l) => s + l.valor, 0));
}

// ─────────────────────────────────────────── invariantes globais (auditoria) ───────────────────────────────────────────

test("invariantes globais: todo título fecha com seus lançamentos e glosas; toda conta, transferência e conciliação fecha", async () => {
  const titulosReceber = await db.$queryRaw<{ id: string; descricao: string }[]>`
    WITH l AS (SELECT "contaReceberId" AS id, SUM(valor) AS pago, SUM(COALESCE(principal, 0) + desconto) AS baix, MAX(data) AS ult
               FROM "Lancamento" WHERE "contaReceberId" IS NOT NULL GROUP BY 1),
         g AS (SELECT "contaReceberId" AS id, SUM(valor) AS glos, MAX(data) AS ult FROM "Glosa" WHERE recurso <> 'REVERTIDA' GROUP BY 1),
         t AS (SELECT c.id, c.descricao, c.valor, c.status::text AS status, c."valorPago", c."valorBaixado", c."pagoEm", l.pago,
                      CASE WHEN l.id IS NULL AND g.id IS NULL THEN NULL ELSE COALESCE(l.baix, 0) + COALESCE(g.glos, 0) END AS baixado,
                      GREATEST(l.ult, g.ult) AS ult
               FROM "ContaReceber" c LEFT JOIN l ON l.id = c.id LEFT JOIN g ON g.id = c.id)
    SELECT id, descricao FROM t
    WHERE "valorPago" IS DISTINCT FROM pago OR "valorBaixado" IS DISTINCT FROM baixado OR "pagoEm" IS DISTINCT FROM ult
       OR COALESCE("valorBaixado", 0) > valor
       OR NOT ((status = 'CANCELADO' AND "valorBaixado" IS NULL) OR (status = 'PAGO' AND "valorBaixado" >= valor)
               OR (status = 'ABERTO' AND COALESCE("valorBaixado", 0) < valor))`;
  assert.deepEqual(titulosReceber, [], "contas a receber cujo valorPago/valorBaixado/pagoEm/status não fecha com lançamentos + glosas");

  const titulosPagar = await db.$queryRaw<{ id: string; descricao: string }[]>`
    WITH l AS (SELECT "contaPagarId" AS id, SUM(valor) AS pago, SUM(COALESCE(principal, 0) + desconto) AS baix, MAX(data) AS ult
               FROM "Lancamento" WHERE "contaPagarId" IS NOT NULL GROUP BY 1)
    SELECT c.id, c.descricao FROM "ContaPagar" c LEFT JOIN l ON l.id = c.id
    WHERE c."valorPago" IS DISTINCT FROM l.pago OR c."valorBaixado" IS DISTINCT FROM l.baix OR c."pagoEm" IS DISTINCT FROM l.ult
       OR COALESCE(c."valorBaixado", 0) > c.valor
       OR NOT ((c.status = 'CANCELADO' AND c."valorBaixado" IS NULL) OR (c.status = 'PAGO' AND c."valorBaixado" >= c.valor)
               OR (c.status = 'ABERTO' AND COALESCE(c."valorBaixado", 0) < c.valor))`;
  assert.deepEqual(titulosPagar, [], "contas a pagar cujo valorPago/valorBaixado/pagoEm/status não fecha com os lançamentos");

  const lancamentos = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lancamento"
    WHERE (("contaReceberId" IS NOT NULL)::int + ("contaPagarId" IS NOT NULL)::int + ("transferenciaId" IS NOT NULL)::int) > 1
       OR ("contaReceberId" IS NOT NULL AND sentido <> 'ENTRADA') OR ("contaPagarId" IS NOT NULL AND sentido <> 'SAIDA')
       OR (("contaReceberId" IS NOT NULL OR "contaPagarId" IS NOT NULL) AND (principal IS NULL OR valor <> principal + juros + multa))
       OR valor <= 0`;
  assert.deepEqual(lancamentos, [], "lançamentos com vínculo duplo, sentido trocado ou valor ≠ principal + juros + multa");

  const transferencias = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Transferencia" t LEFT JOIN "Lancamento" l ON l."transferenciaId" = t.id
    GROUP BY t.id, t.valor, t.data
    HAVING COUNT(l.id) <> 2 OR COUNT(*) FILTER (WHERE l.sentido = 'SAIDA') <> 1 OR COUNT(*) FILTER (WHERE l.sentido = 'ENTRADA') <> 1
        OR COUNT(DISTINCT l."contaId") <> 2 OR bool_or(l.valor <> t.valor) OR bool_or(l.data <> t.data)`;
  assert.deepEqual(transferencias, [], "transferências sem exatamente uma SAIDA e uma ENTRADA do mesmo valor e data em contas diferentes");

  const conciliadas = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM "ExtratoLinha" e JOIN "Lancamento" l ON l.id = e."lancamentoId"
    WHERE l."contaId" <> e."contaId" OR abs(e.valor) <> l.valor OR (e.valor > 0) <> (l.sentido = 'ENTRADA')`;
  assert.deepEqual(conciliadas, [], "linhas de extrato conciliadas com lançamento de outra conta, sentido ou valor");

  const sql = await db.$queryRaw<{ id: string; nome: string; ativo: boolean; saldo: string }[]>`
    SELECT c.id, c.nome, c.ativo, (c."saldoInicial" + COALESCE(SUM(CASE WHEN l.sentido = 'ENTRADA' THEN l.valor ELSE -l.valor END), 0))::text AS saldo
    FROM "ContaBancaria" c LEFT JOIN "Lancamento" l ON l."contaId" = c.id GROUP BY c.id`;
  const tela = new Map((await listarContas()).map((c) => [c.id, c.saldo]));
  const divergentes = sql.filter((c) => cent(Number(c.saldo)) !== cent(tela.get(c.id) ?? NaN)).map((c) => `${c.nome}: banco ${c.saldo} × tela ${tela.get(c.id)}`);
  assert.deepEqual(divergentes, [], "saldo da conta na tela ≠ saldo inicial + entradas − saídas");
  const inativasComSaldo = sql.filter((c) => !c.ativo && cent(Number(c.saldo)) !== 0).map((c) => `${c.nome}: ${c.saldo}`);
  assert.deepEqual(inativasComSaldo, [], "conta inativa com saldo: painel e fluxo deixam de fechar");
});

// ─────────────────────────────────────────── defeitos (estes testes falham hoje) ───────────────────────────────────────────

test("BUG conciliação: duas baixas simultâneas na MESMA linha do extrato (títulos diferentes) geram dois lançamentos para um só crédito", async () => {
  const [t1, t2] = [await receber(100), await receber(100)];
  const linha = await linhaExtrato(100);
  const r = await corrida(
    (t) => baixarEConciliarTx(t, linha.id, { tituloId: t1.id, juros: 0, multa: 0, desconto: 0 }),
    (t) => baixarEConciliarTx(t, linha.id, { tituloId: t2.id, juros: 0, multa: 0, desconto: 0 }),
  );
  const caixa = await somaLanc({ contaReceberId: { in: [t1.id, t2.id] } });
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1, `as duas passaram: o banco creditou 100 e o sistema registrou ${caixa} de recebimento`);
});

test("BUG SISPAG: o mesmo retorno (pagamento parcial) processado duas vezes ao mesmo tempo baixa o título duas vezes", async () => {
  const t = await pagar(1000);
  await gerar([t.id]);
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { contaPagarId: t.id } });
  const res = retornoPago(item.id, 400);
  await corrida((x) => aplicarRetornoTx(x, res, contagemVazia()), (x) => aplicarRetornoTx(x, res, contagemVazia()));
  assert.equal(await somaLanc({ contaPagarId: t.id }), 400, "o banco pagou 400 uma vez; o sistema registrou duas saídas de 400");
});

test("BUG glosa: REVERTER e MANTER ao mesmo tempo deixam a glosa MANTIDA abatendo o título sem estar em valorBaixado", async () => {
  const t = await receber(1000);
  const g = await tx((x) => registrarGlosa(x, { tituloId: t.id, valor: 200, data: dia(0), motivo: `${P} motivo` }));
  await tx((x) => registrarRecurso(x, g.id, "RECORRER", dia(0)));
  const r = await corrida((x) => registrarRecurso(x, g.id, "REVERTER", dia(0)), (x) => registrarRecurso(x, g.id, "MANTER", dia(0)));
  const glosa = await db.glosa.findUniqueOrThrow({ where: { id: g.id } });
  const titulo = await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } });
  const esperado = glosa.recurso === "REVERTIDA" ? 0 : 200;
  assert.equal(num(titulo.valorBaixado), esperado, `recurso final ${glosa.recurso}, valorBaixado ${titulo.valorBaixado}; ${r.filter((x) => x.status === "fulfilled").length} transação(ões) passaram`);
});

test("BUG DRE: remover um consumo de cirurgia lança GANHO de estoque no DRE (o consumo nunca entrou como perda)", async () => {
  const hosp = await mkHospital();
  const local = await tx((t) => localDoHospital(t, hosp.id));
  const p = await mkProduto({ custoMedio: 1234.57 });
  const l = await mkLote(p.id);
  await tx((t) => movimentar(t, { tipo: "REMESSA", produtoId: p.id, loteId: l.id, quantidade: 1, destinoId: local, custoUnit: 1234.57 }));
  const medico = await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } });
  const cir = await db.cirurgia.create({ data: { dataHora: new Date(), hospitalId: hosp.id, medicoId: medico.id, paciente: `${P} paciente`, status: "CONFIRMADA" } });
  await tx((t) => registrarConsumoDiretoTx(t, { cirurgiaId: cir.id, loteId: l.id, quantidade: 1, usuario: "teste" }));
  const antes = await linhaDreMes("PERDA_ESTOQUE");
  const consumo = await db.cirurgiaConsumo.findFirstOrThrow({ where: { cirurgiaId: cir.id } });
  await tx((t) => removerConsumoTx(t, consumo.id, "teste"));
  const depois = await linhaDreMes("PERDA_ESTOQUE");
  assert.equal(r2(depois - antes), 0, `o estorno do consumo mudou "Perdas e ajustes de estoque" em ${r2(depois - antes)} (consumir + estornar deveria ser neutro)`);
});

test("BUG inventário: falta 'cobrar do hospital' sai do estoque e não gera conta a receber (o valor a cobrar não chega ao financeiro)", async () => {
  const hosp = await mkHospital();
  const local = await tx((t) => localDoHospital(t, hosp.id));
  const p = await mkProduto({ custoMedio: 777.77 });
  const l = await mkLote(p.id);
  await tx((t) => movimentar(t, { tipo: "REMESSA", produtoId: p.id, loteId: l.id, quantidade: 5, destinoId: local, custoUnit: 777.77 }));
  const inv = await tx((t) => criarInventario(t, { hospitalId: hosp.id, usuario: "teste" }));
  const item = await db.inventarioConsignacaoItem.findFirstOrThrow({ where: { inventarioId: inv.id } });
  await tx((t) => salvarContagem(t, inv.id, [{ itemId: item.id, contado: 3 }]));
  await tx((t) => concluirContagem(t, inv.id));
  const antes = await linhaDreMes("PERDA_ESTOQUE");
  await tx((t) => fecharInventario(t, inv.id, [{ itemId: item.id, resolucao: "COBRAR_HOSPITAL" }], "teste"));
  const dre = r2((await linhaDreMes("PERDA_ESTOQUE")) - antes);
  const cobrado = num((await db.contaReceber.aggregate({ where: { hospitalId: hosp.id, status: { not: "CANCELADO" } }, _sum: { valor: true } }))._sum.valor);
  assert.equal(cobrado, 1555.54, `valorCobrar 1555.54 gravado só no inventário; contas a receber do hospital: ${cobrado}; DRE "Perdas e ajustes": ${dre}`);
});

test("BUG separação de funções: conta gerada por compras, já aprovada, muda de valor e de fornecedor e continua aprovada", async () => {
  const outro = (await mkFornecedor()).id;
  const id = await tx((t) => gerarContaPagarTx(t, { descricao: `${P} frete`, fornecedorId, pedidoId: null, categoria: "Custos de importação", valor: 100, vencimento: dia(10), competencia: dia(0), chavePlano: "CUSTO_IMPORTACAO" }));
  await tx((t) => aprovarContasPagarTx(t, [id], "aprovador-teste"));
  await tx((t) => alterarContaPagarGeradaTx(t, id, { descricao: `${P} frete`, valor: 100000, vencimento: dia(10), fornecedorId: outro, chavePlano: "CUSTO_IMPORTACAO" }));
  const c = await db.contaPagar.findUniqueOrThrow({ where: { id } });
  assert.equal(c.aprovadoEm, null, `aprovada para 100 ao fornecedor original; agora ${c.valor} a outro fornecedor e aprovadoEm = ${c.aprovadoEm?.toISOString()}`);
});

test("BUG SISPAG: o financeiro edita o valor ou cancela uma conta que está numa remessa já gerada (arquivo pode estar no banco)", async () => {
  const t = await pagar(1000);
  await gerar([t.id]);
  const dados = { descricao: `${P} pagar`, fornecedorId, planoContaId: planoDespesa, centroCustoId: null, competencia: dia(0), codigoBarras: null, valor: 1, vencimento: dia(5) };
  const edicao = await tx((x) => salvarContaPagarTx(x, t.id, dados, "u")).then(() => "aceita", (e: Error) => e.message);
  const cancel = await tx((x) => cancelarTituloTx(x, "pagar", t.id)).then(() => "aceito", (e: Error) => e.message);
  assert.ok(edicao !== "aceita" && cancel !== "aceito", `edição ${edicao}; cancelamento ${cancel}; o item da remessa continua ENVIADO por 1000`);
});

test("BUG cobrança: o financeiro edita o valor de título com boleto registrado no banco", async () => {
  const t = await receber(1000);
  await db.contaReceber.update({ where: { id: t.id }, data: { cobrancaStatus: "REGISTRADO", nossoNumero: uid().slice(0, 8) } });
  const dados = { descricao: `${P} receber`, hospitalId, planoContaId: (await db.planoConta.findUniqueOrThrow({ where: { codigo: "1.01" } })).id, centroCustoId: null, competencia: dia(0), valor: 1, vencimento: dia(5) };
  const r = await tx((x) => salvarContaReceberTx(x, t.id, dados)).then(() => "aceita", (e: Error) => e.message);
  assert.notEqual(r, "aceita", "o boleto registrado continua cobrando 1000 de um título que agora vale 1");
});

test("BUG fluxo: com 'De' no passado, título atrasado entra como atrasado E como previsto da faixa (conta duas vezes)", async () => {
  const de = dia(-10), ate = dia(10);
  const fim = async () => (await calcularFluxo(de, ate, "mes", hojeUTC())).faixas.at(-1)!.acumulado;
  const antes = await fim();
  await receber(1000, { vencimento: dia(-3) });
  const depois = await fim();
  assert.equal(r2(depois - antes), 1000, `um título de 1000 aumentou o saldo acumulado projetado em ${r2(depois - antes)}`);
});

test("BUG (decisão) aprovação: conta a pagar de competência em mês fechado não pode ser aprovada, logo não entra no SISPAG", async () => {
  const c = await pagar(100, { aprovado: false, competencia: DIA_FECHADO });
  const r = await comMesFechado(() => tx((t) => aprovarContasPagarTx(t, [c.id], "aprovador-teste"))).then(() => "aprovada", (e: Error) => e.message);
  assert.equal(r, "aprovada", "aprovar não muda DRE nem caixa; a recusa obriga a reabrir o mês só para pagar a conta");
});

// ─────────────────────────────────────────── regras conferidas (estes testes passam) ───────────────────────────────────────────

test("OK concorrência: glosa e baixa simultâneas no mesmo título não passam do saldo (trava de linha)", async () => {
  const t = await receber(1000);
  const r = await Promise.allSettled([
    tx((x) => registrarGlosa(x, { tituloId: t.id, valor: 600, data: dia(0), motivo: `${P} motivo` })),
    tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId: conta.id, data: dia(0), valor: 600 })),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  const titulo = await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(num(titulo.valorBaixado), 600);
  assert.equal(titulo.status, "ABERTO");
});

test("OK concorrência: duas linhas do extrato não se ligam ao mesmo lançamento (índice único)", async () => {
  const lan = await tx((t) => lancarAvulsoTx(t, conta.id, { sentido: "SAIDA", descricao: `${P} tarifa`, planoContaId: planoDespesa, centroCustoId: null, valor: 50, data: dia(0) }));
  const [l1, l2] = [await linhaExtrato(-50), await linhaExtrato(-50)];
  const r = await Promise.allSettled([tx((t) => conciliarComLancamentoTx(t, l1.id, lan.id)), tx((t) => conciliarComLancamentoTx(t, l2.id, lan.id))]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.extratoLinha.count({ where: { lancamentoId: lan.id } }), 1);
});

test("OK glosa total quita sem dinheiro e o estorno reabre o título com valorBaixado e pagoEm nulos", async () => {
  const t = await receber(500);
  const g = await tx((x) => registrarGlosa(x, { tituloId: t.id, valor: 500, data: dia(0), motivo: `${P} motivo` }));
  assert.equal((await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } })).status, "PAGO");
  await tx((x) => estornarGlosa(x, g.id));
  const depois = await db.contaReceber.findUniqueOrThrow({ where: { id: t.id } });
  assert.deepEqual([depois.status, depois.valorBaixado, depois.pagoEm], ["ABERTO", null, null]);
});

test("OK mês fechado: importar extrato só lê (passa); retorno SISPAG com pagamento em mês fechado é recusado inteiro", async () => {
  const t = await pagar(300);
  await gerar([t.id]);
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { contaPagarId: t.id } });
  const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST>\n<STMTTRN>\n<DTPOSTED>20230310\n<TRNAMT>-12.34\n<FITID>${P}-${uid()}\n<MEMO>${P} mov\n</STMTTRN>\n</BANKTRANLIST></OFX>`;
  await comMesFechado(async () => {
    const imp = await importarExtratoTexto(conta.id, ofx);
    assert.equal(imp.novas, 1);
    await assert.rejects(tx((x) => aplicarRetornoTx(x, retornoPago(item.id, 300, DIA_FECHADO), contagemVazia())), /está fechado/);
  });
  assert.equal((await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: item.id } })).status, "ENVIADO");
  assert.equal(await somaLanc({ contaPagarId: t.id }), 0);
});

test("OK transferência: muda o saldo das contas e fica fora do DRE e do realizado do painel/fluxo (mesmo critério transferenciaId)", async () => {
  const ini = inicioMes(hojeUTC());
  const dre = async () => r2((await carregarLinhasDre(ini, addMeses(ini, 1), null)).reduce((s, l) => s + l.valor, 0));
  const realizado = async () => {
    const f = await calcularFluxo(dia(0), dia(0), "mes", hojeUTC());
    return r2(f.faixas.reduce((s, x) => s + x.recReal - x.pagReal, 0));
  };
  const [d0, f0] = [await dre(), await realizado()];
  await tx((t) => transferir(t, { origemId: conta.id, destinoId: contaB, valor: 321.09, data: dia(0), descricao: `${P} transf` }));
  const saldos = new Map((await listarContas()).map((c) => [c.id, c.saldo]));
  assert.equal(r2((saldos.get(contaB) ?? 0)), 321.09);
  assert.deepEqual([await dre(), await realizado()], [d0, f0]);
});
