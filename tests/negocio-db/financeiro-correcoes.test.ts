/**
 * Regras acrescentadas na correção da revisão de consistência financeira (16/10/2026, docs/REVISAO.md seção 18):
 * saldo inicial travado, conta bancária ativa única por agência/conta, troca de centro de custo com baixa em mês fechado,
 * retorno SISPAG sem valor efetivo, boleto divergente do título e aprovação que só cai quando muda o que foi aprovado.
 * Dados com prefixo TESTEDB. Rode com `npm run test:db` (sob o lock do banco de teste).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { codigoBarras44 } from "@/app/(app)/financeiro/_lib/cobranca";
import { alternarAtivoContaTx, lancarAvulsoTx, salvarContaTx, type DadosConta } from "@/app/(app)/financeiro/_lib/contas-servico";
import { aplicarRetornoTx, contagemVazia, gerarRemessaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { classificarTituloTx, salvarContaPagarTx } from "@/app/(app)/financeiro/_lib/titulos-servico";
import { registrarBaixa } from "@/app/(app)/financeiro/_lib/titulos";
import { aprovarContasPagarTx } from "@/app/(app)/financeiro/_lib/aprovacao-servico";
import { alterarContaPagarGeradaTx, gerarContaPagarTx } from "@/app/(app)/financeiro/_lib/publico";
import { aprovarFavorecidosTeste, dia, limparTudo, mkFornecedor, num, P } from "./_util";

type T = Parameters<Parameters<typeof db.$transaction>[0]>[0];
const tx = <R>(f: (t: T) => Promise<R>) => db.$transaction(f, { timeout: 20_000, maxWait: 10_000 });
const MES_FECHADO = "2023-04";
const DIA_FECHADO = new Date("2023-04-12T00:00:00Z");
let mesJaFechado = false;
let fornecedorId: string, planoDespesa: string, centroA: string, centroB: string;

const conta = (o: Partial<DadosConta> = {}): DadosConta => ({
  nome: `${P} corr conta`, tipo: "BANCO", banco: "341", agencia: "0777", numero: "88877-1", saldoInicial: 0, titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE",
  carteiraCobranca: null, cobrancaMultaPercent: 2, cobrancaJurosMensalPercent: 1, ...o,
});

async function limpar() {
  const contas = (await db.contaBancaria.findMany({ where: { nome: { startsWith: P } }, select: { id: true } })).map((c) => c.id);
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: contas } }, { descricao: { startsWith: P } }] } });
  await db.remessaPagamento.deleteMany({ where: { contaId: { in: contas } } });
  await limparTudo();
  await db.centroCusto.deleteMany({ where: { nome: { startsWith: P } } });
  await db.contaBancaria.deleteMany({ where: { id: { in: contas } } });
}

before(async () => {
  await limpar();
  mesJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_FECHADO } }));
  fornecedorId = (await mkFornecedor()).id;
  await db.fornecedor.update({ where: { id: fornecedorId }, data: { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" } });
  await aprovarFavorecidosTeste();
  planoDespesa = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4.02" } })).id;
  centroA = (await db.centroCusto.create({ data: { codigo: `T${Date.now() % 100000}A`, nome: `${P} centro A` } })).id;
  centroB = (await db.centroCusto.create({ data: { codigo: `T${Date.now() % 100000}B`, nome: `${P} centro B` } })).id;
});
after(async () => {
  if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  await limpar();
  await db.$disconnect();
});

test("conta bancária: saldo inicial não muda depois do primeiro lançamento; demais campos mudam e vão para a auditoria", async () => {
  const c = await tx((t) => salvarContaTx(t, null, conta({ agencia: "0701", numero: "70101-1", saldoInicial: 100 })));
  const ed = await tx((t) => salvarContaTx(t, c.id, conta({ agencia: "0701", numero: "70101-1", saldoInicial: 150, nome: `${P} corr renomeada` })));
  assert.match(ed.mudancas, /saldoInicial: 100 → 150/);
  assert.match(ed.mudancas, /nome: .* → TESTEDB corr renomeada/);
  await tx((t) => lancarAvulsoTx(t, c.id, { sentido: "SAIDA", descricao: `${P} tarifa`, planoContaId: planoDespesa, centroCustoId: null, valor: 10, data: dia(0) }));
  await assert.rejects(tx((t) => salvarContaTx(t, c.id, conta({ agencia: "0701", numero: "70101-1", saldoInicial: 999 }))), /saldo inicial .* não pode mais mudar/);
  await tx((t) => salvarContaTx(t, c.id, conta({ agencia: "0701", numero: "70101-1", saldoInicial: 150, nome: `${P} corr outra` })));
  assert.equal(num((await db.contaBancaria.findUniqueOrThrow({ where: { id: c.id } })).saldoInicial), 150);
});

test("conta bancária: duas contas ativas com a mesma agência/conta são recusadas (serviço e índice único normalizado)", async () => {
  const a = await tx((t) => salvarContaTx(t, null, conta({ agencia: "0702", numero: "70202-2" })));
  await assert.rejects(tx((t) => salvarContaTx(t, null, conta({ nome: `${P} corr dup`, agencia: "702", numero: "702022" }))), /já usa a agência/);
  await assert.rejects(
    db.contaBancaria.create({ data: { nome: `${P} corr dup direto`, tipo: "BANCO", agencia: "702", numero: "702022", saldoInicial: 0 } }),
    /Unique constraint|unique/i,
  );
  await tx((t) => alternarAtivoContaTx(t, a.id)); // inativa (saldo zero)
  const b = await tx((t) => salvarContaTx(t, null, conta({ nome: `${P} corr nova`, agencia: "702", numero: "702022" })));
  await assert.rejects(tx((t) => alternarAtivoContaTx(t, a.id)), /está ativa com a mesma agência/);
  assert.ok(b.id);
});

test("reclassificar: trocar o centro de custo de título com baixa em mês fechado é recusado; só a conta do plano passa", async () => {
  const caixa = await tx((t) => salvarContaTx(t, null, conta({ nome: `${P} corr caixa`, tipo: "CAIXA", agencia: null, numero: null })));
  const t = await db.contaPagar.create({ data: { descricao: `${P} pagar centro`, valor: 100, vencimento: dia(5), competencia: dia(0), fornecedorId, planoContaId: planoDespesa, centroCustoId: centroA, aprovadoEm: new Date() } });
  await tx((x) => registrarBaixa(x, { tipo: "pagar", tituloId: t.id, contaId: caixa.id, data: DIA_FECHADO, valor: 50 }));
  if (!mesJaFechado) await db.fechamentoMes.create({ data: { mes: MES_FECHADO } });
  try {
    await assert.rejects(tx((x) => classificarTituloTx(x, "pagar", t.id, { planoContaId: planoDespesa, centroCustoId: centroB, competencia: dia(0) })), /está fechado/);
    await tx((x) => classificarTituloTx(x, "pagar", t.id, { planoContaId: planoDespesa, centroCustoId: centroA, competencia: dia(0) }));
  } finally {
    if (!mesJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_FECHADO } });
  }
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } })).centroCustoId, centroA);
});

test("retorno SISPAG 'pago' sem valor efetivo não baixa pelo valor da remessa: fica DIV para a conciliação", async () => {
  const banco = await tx((t) => salvarContaTx(t, null, conta({ nome: `${P} corr banco sispag`, agencia: "0703", numero: "70303-3" })));
  const t = await db.contaPagar.create({ data: { descricao: `${P} pagar sispag`, valor: 300, vencimento: dia(5), competencia: dia(0), fornecedorId, planoContaId: planoDespesa, aprovadoEm: new Date() } });
  await tx((x) => gerarRemessaTx(x, { conta: { id: banco.id, titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", agencia: "0703" }, cd: { conta: "70303", dac: "3" }, modo: "TED_BOLETO", dataPagto: dia(0), ids: [t.id] }));
  const item = await db.remessaPagamentoItem.findFirstOrThrow({ where: { contaPagarId: t.id } });
  const cont = contagemVazia();
  await tx((x) => aplicarRetornoTx(x, [{ seuNumero: `SP${item.id}`, segmento: "A", ocorrencias: ["00"], nossoNumero: "", dataEfetiva: dia(0), valorEfetivo: 0 }], cont));
  assert.equal(cont.divergentes, 1);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: t.id } }), 0);
  const lido = await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([lido.status, lido.ocorrencias], ["PAGO", "00,DIV"]);
});

test("conta a pagar com boleto: valor ou vencimento diferentes do código de barras são recusados", async () => {
  const venc = dia(20);
  const barras = codigoBarras44({ agencia: "0057", conta: "72192", dac: "0", carteira: "109" }, { nossoNumero: "11112222", vencimento: venc, valorCentavos: 45678 });
  const d = { descricao: `${P} pagar boleto`, fornecedorId, planoContaId: planoDespesa, centroCustoId: null, competencia: dia(0), codigoBarras: barras, valor: 456.78, vencimento: venc };
  const id = await tx((x) => salvarContaPagarTx(x, null, d, "u"));
  await assert.rejects(tx((x) => salvarContaPagarTx(x, id, { ...d, valor: 456.77 }, "u")), /boleto é de/);
  await assert.rejects(tx((x) => salvarContaPagarTx(x, null, { ...d, vencimento: dia(21) }, "u")), /boleto vence em/);
});

test("conta gerada por compras: mudar só a descrição mantém a aprovação; mudar o vencimento derruba", async () => {
  const base = { descricao: `${P} frete`, fornecedorId, pedidoId: null, categoria: "Custos de importação", valor: 100, vencimento: dia(10), competencia: dia(0), chavePlano: "CUSTO_IMPORTACAO" as const };
  const id = await tx((t) => gerarContaPagarTx(t, base));
  await tx((t) => aprovarContasPagarTx(t, [id], "aprovador-teste"));
  await tx((t) => alterarContaPagarGeradaTx(t, id, { descricao: `${P} frete internacional`, valor: 100, vencimento: dia(10), fornecedorId, chavePlano: "CUSTO_IMPORTACAO" }));
  assert.ok((await db.contaPagar.findUniqueOrThrow({ where: { id } })).aprovadoEm);
  await tx((t) => alterarContaPagarGeradaTx(t, id, { descricao: `${P} frete internacional`, valor: 100, vencimento: dia(11), fornecedorId, chavePlano: "CUSTO_IMPORTACAO" }));
  const c = await db.contaPagar.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([c.aprovadoEm, c.aprovadoPor], [null, null]);
});
