/**
 * REVISAO §23: idempotência da baixa, do lançamento avulso e da criação de título (token gravado na mesma transação) e
 * trava da conta bancária (inativar x baixa simultâneas). Dados com prefixo TESTEDB.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { MSG_JA_ENVIADO, novoTokenFormulario, registrarEnvioTx } from "@/lib/idempotencia";
import { alternarAtivoContaTx, lancarAvulsoTx } from "@/app/(app)/financeiro/_lib/contas-servico";
import { registrarBaixa } from "@/app/(app)/financeiro/_lib/titulos";
import { dia, limparTudo, mkFornecedor, num, P } from "./_util";

type T = Parameters<Parameters<typeof db.$transaction>[0]>[0];
const tx = <R>(f: (t: T) => Promise<R>) => db.$transaction(f, { timeout: 20_000, maxWait: 10_000 });
const tokens: string[] = [];
const novo = () => {
  const t = novoTokenFormulario();
  tokens.push(t);
  return t;
};
let fornecedorId: string, plano: string;

async function limpar() {
  const contas = (await db.contaBancaria.findMany({ where: { nome: { startsWith: P } }, select: { id: true } })).map((c) => c.id);
  await db.lancamento.deleteMany({ where: { OR: [{ contaId: { in: contas } }, { descricao: { startsWith: P } }] } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: P } } });
  await limparTudo();
  await db.contaBancaria.deleteMany({ where: { id: { in: contas } } });
}
const mkConta = async (n: string, saldoInicial = 0) => (await db.contaBancaria.create({ data: { nome: `${P} rob ${n}`, tipo: "BANCO", saldoInicial } })).id;
const mkPagar = async (valor = 100) => (await db.contaPagar.create({ data: { descricao: `${P} rob pagar`, valor, vencimento: dia(10), competencia: dia(0), fornecedorId } })).id;
const saldo = async (contaId: string) => {
  const c = await db.contaBancaria.findUniqueOrThrow({ where: { id: contaId } });
  const l = await db.lancamento.findMany({ where: { contaId }, select: { sentido: true, valor: true } });
  return num(c.saldoInicial) + l.reduce((s, x) => s + (x.sentido === "ENTRADA" ? 1 : -1) * num(x.valor), 0);
};
const baixa = (tituloId: string, contaId: string) => ({ tipo: "pagar" as const, tituloId, contaId, data: dia(0), valor: 100 });

before(async () => {
  await limpar();
  fornecedorId = (await mkFornecedor()).id;
  plano = (await db.planoConta.findUniqueOrThrow({ where: { codigo: "4.02" } })).id;
});
after(async () => {
  await db.formularioEnviado.deleteMany({ where: { token: { in: tokens } } });
  await limpar();
  await db.$disconnect();
});

test("(a) baixa reenviada com o mesmo token é recusada e só uma baixa existe", async () => {
  const conta = await mkConta("baixa");
  const titulo = await mkPagar(300);
  const t = novo();
  const enviar = () =>
    tx(async (x) => {
      await registrarEnvioTx(x, t, null);
      await registrarBaixa(x, baixa(titulo, conta));
    });
  await enviar();
  await assert.rejects(enviar(), (e: Error) => e.message === MSG_JA_ENVIADO);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: titulo } }), 1);
  // dois envios simultâneos do mesmo formulário: só um passa
  const t2 = novo();
  const r = await Promise.allSettled([1, 2].map(() => tx(async (x) => { await registrarEnvioTx(x, t2, null); await registrarBaixa(x, baixa(titulo, conta)); })));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.lancamento.count({ where: { contaPagarId: titulo } }), 2);
});

test("(b) lançamento avulso reenviado com o mesmo token é recusado e só um existe", async () => {
  const conta = await mkConta("avulso");
  const t = novo();
  const d = { sentido: "SAIDA" as const, descricao: `${P} tarifa`, planoContaId: plano, centroCustoId: null, valor: 12.5, data: dia(0) };
  const enviar = () =>
    tx(async (x) => {
      await registrarEnvioTx(x, t, null);
      return lancarAvulsoTx(x, conta, d);
    });
  await enviar();
  await assert.rejects(enviar(), (e: Error) => e.message === MSG_JA_ENVIADO);
  assert.equal(await db.lancamento.count({ where: { contaId: conta } }), 1);
});

test("as actions de baixa, lançamento avulso e criação de título gravam o token na transação e os formulários o enviam", async () => {
  const raiz = path.resolve(import.meta.dirname, "../../src/app/(app)/financeiro");
  const ler = (p: string) => readFile(path.join(raiz, p), "utf8");
  const actions = await ler("_lib/actions.ts");
  // baixarTitulo: token e baixa na mesma transação
  assert.match(actions, /\$transaction\(async \(tx\) => \{\s*await registrarEnvioTx\(tx, fd\.get\(CAMPO_TOKEN\), user\.id\);[^\n]*\n\s*await registrarBaixa\(/);
  // salvarTitulo: só na criação (id nulo), nos dois tipos
  assert.equal((actions.match(/if \(!id\) await registrarEnvioTx\(tx, fd\.get\(CAMPO_TOKEN\), user\.id\)/g) ?? []).length, 2);
  assert.match(await ler("_lib/contas-actions.ts"), /await registrarEnvioTx\(tx, fd\.get\(CAMPO_TOKEN\), user\.id\);[^\n]*\n\s*return lancarAvulsoTx\(/);
  const form = await ler("_lib/titulo-form.tsx");
  assert.equal((form.match(/<TokenFormulario \/>/g) ?? []).length, 2); // criação de título e baixa
  assert.match(await ler("contas/[id]/page.tsx"), /<TokenFormulario \/>/);
});

test("(c) inativar a conta e dar baixa ao mesmo tempo nunca deixam conta inativa com saldo", async () => {
  // baixa antes: a baixa segura a trava da conta; inativar espera, relê o saldo e recusa
  const a = await mkConta("c1");
  const tituloA = await mkPagar();
  let soltar!: () => void;
  let travou!: () => void;
  const portao = new Promise<void>((r) => (soltar = r));
  const baixaFeita = new Promise<void>((r) => (travou = r));
  const baixando = tx(async (x) => {
    await registrarBaixa(x, baixa(tituloA, a));
    travou();
    await portao;
  });
  await baixaFeita;
  const inativando = tx((x) => alternarAtivoContaTx(x, a));
  await esperar(500);
  soltar();
  const r1 = await Promise.allSettled([baixando, inativando]);
  assert.equal(r1[0].status, "fulfilled");
  assert.equal(r1[1].status, "rejected", "inativar deveria ter relido o saldo depois da baixa");
  assert.match(String((r1[1] as PromiseRejectedResult).reason?.message), /A conta tem saldo de/);
  assert.equal((await db.contaBancaria.findUniqueOrThrow({ where: { id: a } })).ativo, true);

  // inativar antes: a baixa espera a trava e depois recusa a conta inativa
  const b = await mkConta("c2");
  const tituloB = await mkPagar();
  let soltar2!: () => void;
  let travou2!: () => void;
  const portao2 = new Promise<void>((r) => (soltar2 = r));
  const inativou = new Promise<void>((r) => (travou2 = r));
  const inativando2 = tx(async (x) => {
    await alternarAtivoContaTx(x, b);
    travou2();
    await portao2;
  });
  await inativou;
  const baixando2 = tx((x) => registrarBaixa(x, baixa(tituloB, b)));
  await esperar(500);
  soltar2();
  const r2 = await Promise.allSettled([inativando2, baixando2]);
  assert.equal(r2[0].status, "fulfilled");
  assert.equal(r2[1].status, "rejected", "a baixa deveria ter lido a conta já inativa");
  assert.match(String((r2[1] as PromiseRejectedResult).reason?.message), /inativa/);
  assert.equal(await db.lancamento.count({ where: { contaId: b } }), 0);

  // corrida solta (sem portão): em qualquer ordem, conta inativa tem saldo zero
  for (let i = 0; i < 5; i++) {
    const c = await mkConta(`c3-${i}`);
    const titulo = await mkPagar();
    await Promise.allSettled([tx((x) => registrarBaixa(x, baixa(titulo, c))), tx((x) => alternarAtivoContaTx(x, c))]);
    const ativo = (await db.contaBancaria.findUniqueOrThrow({ where: { id: c } })).ativo;
    assert.ok(ativo || Math.abs(await saldo(c)) < 0.005, `iteração ${i}: conta inativa com saldo ${await saldo(c)}`);
  }
});
