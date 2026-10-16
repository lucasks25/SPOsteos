/**
 * Cadeia (viii) da integração entre setores (docs/INTEGRACAO-SETORES.md §4): fechamento de mês bloqueia TODA mutação
 * financeira com data/competência no mês. Monta dados reais no mês (com ele aberto), fecha pelo serviço, varre uma
 * mutação por vez (cada uma tem de ser recusada com "está fechado") e confere que o DRE do mês, os lançamentos e os
 * títulos não mudaram. Depois reabre e mostra que a mesma operação passa (a recusa era do mês, não de outra regra).
 * Mês usado: 2019-02 (sem dados reais na base). Rode com `npm run test:db` (sob o lock do banco de teste).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import type { RetornoCobranca } from "@/app/(app)/financeiro/_lib/cobranca";
import { aplicarRetornoCobrancaTx, contagemCobrancaVazia } from "@/app/(app)/financeiro/_lib/cobranca-servico";
import { aplicarRetornoTx, contagemVazia, gerarRemessaDaContaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { estornarBaixa, estornarGlosa, estornarTransferencia, registrarBaixa, registrarGlosa, registrarRecurso, transferir } from "@/app/(app)/financeiro/_lib/titulos";
import { cancelarTituloTx, classificarTituloTx, salvarContaPagarTx, salvarContaReceberTx } from "@/app/(app)/financeiro/_lib/titulos-servico";
import { excluirLancamentoAvulsoTx, lancarAvulsoTx } from "@/app/(app)/financeiro/_lib/contas-servico";
import { avulsoEConciliarTx, baixarEConciliarTx } from "@/app/(app)/financeiro/_lib/conciliacao-servico";
import { alterarContaPagarGeradaTx, cancelarContaPagarGeradaTx, gerarContaPagarTx, gerarContaReceberTx } from "@/app/(app)/financeiro/_lib/publico";
import { aprovarContasPagarTx } from "@/app/(app)/financeiro/_lib/aprovacao-servico";
import { fecharMesTx, reabrirMesTx } from "@/app/(app)/financeiro/_lib/fechamento-servico";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { aprovarFavorecidosTeste, mkFornecedor, mkHospital, num, P, uid } from "./_util";
import { fotoDre, limparIntegracao, mkConta, recusa, tx } from "./_integracao";
import { conferirTudo } from "./_invariantes";

const MES = "2019-02";
const D = (d: number) => new Date(Date.UTC(2019, 1, d));
let fechadoPorEsteTeste = false;

before(limparIntegracao);
after(async () => {
  if (fechadoPorEsteTeste) await db.fechamentoMes.deleteMany({ where: { mes: MES } });
  await limparIntegracao();
  await db.$disconnect();
});

test("(viii) mês fechado recusa toda mutação financeira com data no mês (varredura uma a uma); DRE, caixa e títulos ficam intactos", async (t) => {
  if (await db.fechamentoMes.findUnique({ where: { mes: MES } })) return t.skip(`${MES} já está fechado nesta base: a varredura precisa montar dados com o mês aberto`);

  // ── dados no mês, com ele aberto ──
  const conta = await mkConta({ agencia: "5566", numero: "556677" });
  const contaCob = await mkConta({ agencia: "6677", numero: "667788", cobranca: true });
  const caixa = await mkConta({ tipo: "CAIXA", numero: "fech" });
  const fornecedorId = (await mkFornecedor()).id;
  await db.fornecedor.update({ where: { id: fornecedorId }, data: { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" } });
  await aprovarFavorecidosTeste();
  const hospitalId = (await mkHospital()).id;
  const pRec = (await db.planoConta.findUniqueOrThrow({ where: { chaveSistema: "RECEITA_VENDA" } })).id;
  const pDesp = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4.02" } })).id;
  const rec = (valor: number, venc = D(28)) => ({ descricao: `${P} fech receber`, hospitalId, planoContaId: pRec, centroCustoId: null, competencia: D(10), valor, vencimento: venc });
  const pag = (valor: number) => ({ descricao: `${P} fech pagar`, fornecedorId, planoContaId: pDesp, centroCustoId: null, competencia: D(10), codigoBarras: null, valor, vencimento: D(28) });

  const r1 = await tx((x) => salvarContaReceberTx(x, null, rec(1000)));
  const l1 = await tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: r1, contaId: conta.id, data: D(15), valor: 300 }));
  const g1 = await tx((x) => registrarGlosa(x, { tituloId: r1, valor: 100, data: D(15), motivo: `${P} glosa um` }));
  const g2 = await tx((x) => registrarGlosa(x, { tituloId: r1, valor: 50, data: D(15), motivo: `${P} glosa dois` }));
  await tx((x) => registrarRecurso(x, g2.id, "RECORRER", D(16)));
  const r2 = await tx((x) => salvarContaReceberTx(x, null, rec(500)));
  const pg = await tx((x) => salvarContaPagarTx(x, null, pag(400), "teste"));
  const pg3 = await tx((x) => salvarContaPagarTx(x, null, pag(200), "teste"));
  const pg2 = await tx((x) => gerarContaPagarTx(x, { descricao: `${P} fech gerada`, fornecedorId, pedidoId: null, categoria: "Custos de importação", valor: 150, vencimento: D(28), competencia: D(10), chavePlano: "CUSTO_IMPORTACAO" }));
  await tx((x) => aprovarContasPagarTx(x, [pg], "aprovador-teste")); // criada à mão nasce sem aprovação (§21)
  const rem = await tx((x) => gerarRemessaDaContaTx(x, { contaId: conta.id, modo: "TED_BOLETO", dataPagto: D(20), ids: [pg] }));
  const itemSp = await db.remessaPagamentoItem.findFirstOrThrow({ where: { remessaId: rem.remessaId } });
  const tr = await tx((x) => transferir(x, { origemId: conta.id, destinoId: caixa.id, valor: 100, data: D(15), descricao: `${P} fech transf` }));
  const av = await tx((x) => lancarAvulsoTx(x, conta.id, { sentido: "SAIDA", descricao: `${P} fech tarifa`, planoContaId: pDesp, centroCustoId: null, valor: 30, data: D(15) }));
  const e1 = await db.extratoLinha.create({ data: { contaId: conta.id, data: D(20), valor: -45, descricao: `${P} tarifa`, fitid: `${P}-${uid()}` } });
  const e2 = await db.extratoLinha.create({ data: { contaId: conta.id, data: D(20), valor: 200, descricao: `${P} credito`, fitid: `${P}-${uid()}` } });
  const rc = await tx((x) => salvarContaReceberTx(x, null, rec(700)));
  const NN = "00004321";
  await db.contaReceber.update({ where: { id: rc }, data: { cobrancaContaId: contaCob.id, nossoNumero: NN, cobrancaStatus: "REGISTRADO" } }); // boleto já registrado no banco
  const pv = await db.pedidoVenda.create({ data: { hospitalId, status: "ABERTO", total: 100, custoTotal: 40 } });

  // ── fecha pelo serviço ──
  await tx((x) => fecharMesTx(x, MES, "teste"));
  fechadoPorEsteTeste = true;
  const contas = [conta.id, contaCob.id, caixa.id];
  const foto = async () => ({
    dre: await fotoDre(D(1)),
    lanc: await db.lancamento.findMany({ where: { contaId: { in: contas } }, select: { id: true, valor: true, data: true }, orderBy: { id: "asc" } }),
    glosas: await db.glosa.findMany({ where: { contaReceberId: r1 }, select: { id: true, recurso: true }, orderBy: { id: "asc" } }),
    receber: await db.contaReceber.findMany({ where: { hospitalId }, select: { id: true, valor: true, status: true, valorBaixado: true, competencia: true, planoContaId: true }, orderBy: { id: "asc" } }),
    pagar: await db.contaPagar.findMany({ where: { fornecedorId }, select: { id: true, valor: true, status: true, valorBaixado: true, vencimento: true }, orderBy: { id: "asc" } }),
    transf: await db.transferencia.count({ where: { descricao: { startsWith: P } } }),
    extrato: await db.extratoLinha.count({ where: { contaId: conta.id, lancamentoId: { not: null } } }),
  });
  const antes = await foto();

  const ret = (dataCredito: Date): RetornoCobranca => ({
    agencia: "6677", conta: "66778", dac: "8", dataGeracao: dataCredito, sequencialArquivo: 1, dataCredito, trailer: { quantidade: 1, valorCentavos: 70000 },
    eventos: [{
      linha: 2, carteira: "109", nossoNumero: NN, dacNossoNumero: "0", seuNumero: "", usoEmpresa: "", ocorrencia: { codigo: "06", descricao: "Liquidação", categoria: "LIQUIDACAO" },
      dataOcorrencia: dataCredito, vencimento: D(28), dataCredito, centavos: { titulo: 70000, pago: 70000, jurosMulta: 0, desconto: 0, abatimento: 0, tarifa: 0, iof: 0, outrosCreditos: 0 },
      motivosRejeicao: [], mensagens: [], complemento: null, codigoLiquidacao: null, agenciaCobradora: "", nomePagador: "",
    }],
  });

  // ── varredura: cada mutação com data/competência no mês fechado ──
  const varredura: [string, () => Promise<unknown>][] = [
    ["baixa a receber", () => tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: r2, contaId: conta.id, data: D(20), valor: 100 }))],
    ["baixa a pagar", () => tx((x) => registrarBaixa(x, { tipo: "pagar", tituloId: pg3, contaId: conta.id, data: D(20), valor: 50 }))],
    ["estorno de baixa", () => tx((x) => estornarBaixa(x, "receber", l1.id))],
    ["glosa", () => tx((x) => registrarGlosa(x, { tituloId: r2, valor: 10, data: D(20), motivo: `${P} glosa nova` }))],
    ["estorno de glosa", () => tx((x) => estornarGlosa(x, g1.id))],
    ["recurso REVERTER (glosa do mês)", () => tx((x) => registrarRecurso(x, g2.id, "REVERTER", D(25)))],
    ["transferência", () => tx((x) => transferir(x, { origemId: conta.id, destinoId: caixa.id, valor: 10, data: D(20), descricao: `${P} fech transf 2` }))],
    ["estorno de transferência", () => tx((x) => estornarTransferencia(x, tr.id))],
    ["lançamento avulso", () => tx((x) => lancarAvulsoTx(x, conta.id, { sentido: "ENTRADA", descricao: `${P} rendimento`, planoContaId: pDesp, centroCustoId: null, valor: 5, data: D(20) }))],
    ["excluir avulso", () => tx((x) => excluirLancamentoAvulsoTx(x, av.id))],
    ["conciliação: avulso", () => tx((x) => avulsoEConciliarTx(x, e1.id, { descricao: `${P} tarifa`, planoContaId: pDesp, centroCustoId: null }))],
    ["conciliação: baixar título", () => tx((x) => baixarEConciliarTx(x, e2.id, { tituloId: r2, juros: 0, multa: 0, desconto: 0 }))],
    ["criar título a receber", () => tx((x) => salvarContaReceberTx(x, null, rec(10)))],
    ["editar título a receber", () => tx((x) => salvarContaReceberTx(x, r2, rec(499)))],
    ["criar título a pagar", () => tx((x) => salvarContaPagarTx(x, null, pag(10), "teste"))],
    ["editar título a pagar", () => tx((x) => salvarContaPagarTx(x, pg3, pag(199), "teste"))],
    ["cancelar título a receber", () => tx((x) => cancelarTituloTx(x, "receber", r2))],
    ["cancelar título a pagar", () => tx((x) => cancelarTituloTx(x, "pagar", pg3))],
    ["reclassificar título", () => tx((x) => classificarTituloTx(x, "receber", r2, { planoContaId: pRec, centroCustoId: null, competencia: D(10) }))],
    ["gerarContaPagarTx (outros módulos)", () => tx((x) => gerarContaPagarTx(x, { descricao: `${P} fech gerada 2`, fornecedorId, pedidoId: null, categoria: "Compra de mercadoria", valor: 10, vencimento: D(28), competencia: D(10), chavePlano: "ESTOQUE" }))],
    ["gerarContaReceberTx (outros módulos)", () => tx((x) => gerarContaReceberTx(x, { descricao: `${P} fech gerada r`, hospitalId, pedidoId: null, valor: 10, vencimento: D(28), competencia: D(10), centroCustoId: null, chavePlano: "RECEITA_VENDA" }))],
    ["alterar conta gerada", () => tx((x) => alterarContaPagarGeradaTx(x, pg2, { descricao: `${P} fech gerada`, valor: 151, vencimento: D(28), fornecedorId, chavePlano: "CUSTO_IMPORTACAO" }))],
    ["cancelar conta gerada", () => tx((x) => cancelarContaPagarGeradaTx(x, pg2))],
    ["retorno SISPAG pago no mês", () => tx((x) => aplicarRetornoTx(x, [{ seuNumero: `SP${itemSp.id}`, segmento: "A", ocorrencias: ["00"], nossoNumero: "", dataEfetiva: D(20), valorEfetivo: 400 }], contagemVazia()))],
    ["retorno de cobrança liquidado no mês", () => tx((x) => aplicarRetornoCobrancaTx(x, ret(D(20)), contagemCobrancaVazia()))],
    ["registrar NF com data no mês", () => tx((x) => registrarNfTx(x, pv.id, `${P}${uid()}`, D(28), new Date("2019-02-15T15:00:00Z")))],
  ];
  const passaram: string[] = [];
  for (const [nome, f] of varredura) {
    const msg = await recusa(f());
    if (!/está fechado/.test(msg)) passaram.push(`${nome}: ${msg}`);
  }
  assert.deepEqual(passaram, [], "mutações que não foram recusadas pelo mês fechado (ou recusadas por outro motivo)");

  const depois = await foto();
  assert.deepEqual(depois, antes, "nada mudou no mês fechado: DRE, lançamentos, glosas, títulos, transferências e conciliações");
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv.id } })).status, "ABERTO");
  assert.equal((await db.remessaPagamentoItem.findUniqueOrThrow({ where: { id: itemSp.id } })).status, "ENVIADO");
  assert.equal(await db.cobrancaEvento.count({ where: { contaId: contaCob.id } }), 0);

  // permitidos por decisão (não mudam DRE nem caixa): aprovar (M7) e MANTER/RECORRER recurso
  assert.equal(await tx((x) => aprovarContasPagarTx(x, [pg2], "aprovador-teste")), 1);
  await tx((x) => registrarRecurso(x, g2.id, "MANTER", D(25)));
  assert.deepEqual((await foto()).dre, antes.dre);

  // reabre: a mesma operação passa (a recusa era do mês)
  await tx((x) => reabrirMesTx(x, MES));
  fechadoPorEsteTeste = false;
  await tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: r2, contaId: conta.id, data: D(20), valor: 100 }));
  assert.equal(num((await db.contaReceber.findUniqueOrThrow({ where: { id: r2 } })).valorBaixado), 100);
  await conferirTudo();
});
