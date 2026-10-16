/**
 * Dupla checagem dos dados de pagamento (docs/REVISAO.md §19, achado S2): trocou banco/conta/Pix/CNPJ do favorecido,
 * o SISPAG recusa até OUTRA pessoa aprovar; aprovar exige ter visto os dados atuais; voltar ao aprovado dispensa aprovação;
 * a edição espera a geração de remessa em andamento (trava de linha).
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeUTC } from "@/lib/datas";
import { aprovarDadosPagamento, gravarDadosPagamento } from "@/app/(app)/financeiro/_lib/favorecidos-servico";
import { hashDadosPagamento, situacaoAprovacao, travarFornecedores } from "@/app/(app)/financeiro/_lib/favorecidos-aprovacao";
import { gerarRemessaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";
import { mkFornecedor, P } from "./_util";

const hoje = hojeUTC();
const dados = { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0", chavePix: null };
let A: { id: string; perfil: "FINANCEIRO" };
let B: { id: string; perfil: "FINANCEIRO" };
let conta: { id: string; titularCnpj: string; titularNome: string; agencia: string };

async function limpar() {
  const itens = await db.remessaPagamentoItem.findMany({ where: { contaPagar: { descricao: { startsWith: P } } }, select: { remessaId: true } });
  await db.remessaPagamento.deleteMany({ where: { id: { in: itens.map((i) => i.remessaId) } } });
  await db.remessaPagamento.deleteMany({ where: { conta: { nome: { startsWith: P } } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: P } } });
  await db.logAuditoria.deleteMany({ where: { entidade: "Fornecedor", detalhes: { startsWith: P } } });
  await db.fornecedor.deleteMany({ where: { razaoSocial: { startsWith: P } } });
}

before(async () => {
  await limpar();
  const us = await db.usuario.findMany({ where: { ativo: true }, take: 2, orderBy: { email: "asc" }, select: { id: true } });
  assert.equal(us.length, 2, "precisa de dois usuários no banco (seed)");
  A = { id: us[0].id, perfil: "FINANCEIRO" };
  B = { id: us[1].id, perfil: "FINANCEIRO" };
  const c = await db.contaBancaria.create({ data: { nome: `${P} banco aprov`, tipo: "BANCO", banco: "341", agencia: "0098", numero: "7700155", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", saldoInicial: 0 } });
  conta = { id: c.id, titularCnpj: c.titularCnpj!, titularNome: c.titularNome!, agencia: c.agencia! };
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = (fornecedorId: string) => db.contaPagar.create({ data: { descricao: `${P} pagar aprov`, valor: 500, vencimento: hoje, competencia: hoje, fornecedorId, aprovadoEm: new Date() } });
const gerar = (ids: string[]) => db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd: { conta: "770015", dac: "5" }, modo: "TED_BOLETO", dataPagto: hoje, ids }));
const ler = (id: string) => db.fornecedor.findUniqueOrThrow({ where: { id } });

test("dados bancários alterados: SISPAG recusa até outra pessoa aprovar", async () => {
  const f = await mkFornecedor();
  await gravarDadosPagamento(A, f.id, dados);
  const t = await titulo(f.id);
  await assert.rejects(gerar([t.id]), /aguardando aprovação/);

  const atual = await ler(f.id);
  assert.equal(situacaoAprovacao(atual), "PENDENTE");
  assert.equal(atual.pagamentoAlteradoPor, A.id);
  await assert.rejects(aprovarDadosPagamento(A, f.id, hashDadosPagamento(atual)), /Quem alterou/);
  await assert.rejects(aprovarDadosPagamento(B, f.id, "0".repeat(64)), /mudaram desde que a tela foi aberta/);
  await assert.rejects(aprovarDadosPagamento({ id: B.id, perfil: "COMPRAS" } as never, f.id, hashDadosPagamento(atual)), /Acesso negado/);

  await aprovarDadosPagamento(B, f.id, hashDadosPagamento(atual));
  assert.equal(situacaoAprovacao(await ler(f.id)), "APROVADO");
  await assert.rejects(aprovarDadosPagamento(B, f.id, hashDadosPagamento(atual)), /já estão aprovados/);
  const r = await gerar([t.id]);
  assert.equal(r.qtd, 1);
  const log = await db.logAuditoria.findFirst({ where: { entidade: "Fornecedor", entidadeId: f.id, acao: "aprovar dados de pagamento" } });
  assert.equal(log?.usuarioId, B.id);
});

test("trocar de novo pede nova aprovação; voltar aos dados aprovados não pede", async () => {
  const f = await mkFornecedor();
  await gravarDadosPagamento(A, f.id, dados);
  await aprovarDadosPagamento(B, f.id, hashDadosPagamento(await ler(f.id)));
  await gravarDadosPagamento(B, f.id, { ...dados, conta: "11111" }); // golpe: conta nova
  assert.equal(situacaoAprovacao(await ler(f.id)), "PENDENTE");
  await assert.rejects(aprovarDadosPagamento(B, f.id, hashDadosPagamento(await ler(f.id))), /Quem alterou/);
  await gravarDadosPagamento(B, f.id, dados); // desfez
  assert.equal(situacaoAprovacao(await ler(f.id)), "APROVADO");
  const t = await titulo(f.id);
  assert.equal((await gerar([t.id])).qtd, 1);
});

test("CNPJ trocado em Cadastros também exige aprovação (vai no arquivo como documento do favorecido)", async () => {
  const f = await mkFornecedor();
  await gravarDadosPagamento(A, f.id, dados);
  await aprovarDadosPagamento(B, f.id, hashDadosPagamento(await ler(f.id)));
  await db.fornecedor.update({ where: { id: f.id }, data: { cnpj: `8${f.cnpj.slice(1)}` } }); // o que salvarFornecedor faz
  assert.equal(situacaoAprovacao(await ler(f.id)), "PENDENTE");
  const t = await titulo(f.id);
  await assert.rejects(gerar([t.id]), /aguardando aprovação/);
});

test("alteração dos dados espera a geração de remessa em andamento (trava de linha)", async () => {
  const f = await mkFornecedor();
  await gravarDadosPagamento(A, f.id, dados);
  await aprovarDadosPagamento(B, f.id, hashDadosPagamento(await ler(f.id)));
  let soltar!: () => void;
  const segurando = new Promise<void>((r) => (soltar = r));
  let travou!: () => void;
  const travado = new Promise<void>((r) => (travou = r));
  const remessa = db.$transaction(async (tx) => {
    await travarFornecedores(tx, [f.id], "SHARE"); // como gerarRemessaTx
    travou();
    await segurando;
  }, { timeout: 15000 });
  await travado;
  let terminou = false;
  const edicao = gravarDadosPagamento(A, f.id, { ...dados, conta: "22222" }).then(() => (terminou = true));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(terminou, false, "a edição não pode passar enquanto a remessa está sendo gerada");
  soltar();
  await remessa;
  await edicao;
  assert.equal((await ler(f.id)).conta, "22222");
});
