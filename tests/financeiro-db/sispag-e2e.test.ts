/**
 * Fluxo SISPAG ponta a ponta contra o banco, sem login: gerar remessa (crédito Itaú, TED e Pix) →
 * simular o retorno do banco editando o próprio arquivo → processar → conferir títulos, caixa e reprocessamento.
 * O retorno é simulado a partir do manual; só um arquivo real do Itaú valida o formato de verdade.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
import { contaDoRetorno, lerRetornoSispag } from "@/app/(app)/financeiro/_lib/sispag";
import { aplicarRetornoTx, contagemVazia, gerarRemessaTx } from "@/app/(app)/financeiro/_lib/sispag-servico";

const hoje = hojeUTC();
const cd = { conta: "12345", dac: "6" };
let conta: { id: string; titularCnpj: string; titularNome: string; agencia: string };
let fItau: string, fOutro: string, fPix: string;

async function limpar() {
  const itens = await db.remessaPagamentoItem.findMany({ where: { contaPagar: { descricao: { startsWith: "TESTEDB" } } }, select: { remessaId: true } });
  await db.remessaPagamento.deleteMany({ where: { id: { in: itens.map((i) => i.remessaId) } } });
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.fornecedor.deleteMany({ where: { razaoSocial: { startsWith: "TESTEDB" } } });
}
before(async () => {
  await limpar();
  const c = await db.contaBancaria.create({ data: { nome: "TESTEDB e2e", tipo: "BANCO", banco: "341", agencia: "1234", numero: "123456", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", saldoInicial: 100000 } });
  conta = { id: c.id, titularCnpj: c.titularCnpj!, titularNome: c.titularNome!, agencia: c.agencia! };
  const f = (n: string, cnpj: string, extra: object) => db.fornecedor.create({ data: { razaoSocial: `TESTEDB ${n}`, cnpj, ...extra } }).then((x) => x.id);
  fItau = await f("Itau", "11222333000181", { bancoCodigo: "341", agencia: "4321", conta: "98765", contaDigito: "0" });
  fOutro = await f("Outro banco", "22333444000172", { bancoCodigo: "237", agencia: "1111", conta: "22222", contaDigito: "3" });
  fPix = await f("Pix", "33444555000163", { chavePix: "pix@forn.com.br" });
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = (fornecedorId: string, valor: number) => db.contaPagar.create({ data: { descricao: "TESTEDB pagar", valor, vencimento: hoje, competencia: hoje, fornecedorId, aprovadoEm: new Date() } });
const put = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);
const ddmmaaaa = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;

/** Transforma a remessa em retorno: ocorrência por "seu número" (SP<id> → código) e valor efetivo dos pagos. */
function simularRetorno(remessa: string, ocorrencia: Record<string, string>, valores: Record<string, number>) {
  return remessa.split("\r\n").map((l, i) => {
    if (i === 0) return put(l, 143, "2");
    if (l[13] !== "A") return l;
    const sn = /SP\d+/.exec(l.slice(73, 93))![0];
    const oc = ocorrencia[sn];
    if (!oc) return l;
    let r = put(l, 231, oc.padEnd(10));
    if (oc === "00") r = put(put(r, 155, ddmmaaaa(hoje)), 163, String(Math.round(valores[sn] * 100)).padStart(15, "0"));
    return r;
  }).join("\r\n");
}

test("SISPAG ponta a ponta: remessa mista → retorno (pago + rejeitado) → baixas, caixa, reprocesso e nova tentativa", async () => {
  const tA = await titulo(fItau, 1500.5);
  const tB = await titulo(fOutro, 2300);
  const r1 = await db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd, modo: "TED_BOLETO", dataPagto: hoje, ids: [tA.id, tB.id] }));
  const rem = await db.remessaPagamento.findUniqueOrThrow({ where: { id: r1.remessaId }, include: { itens: true } });
  assert.deepEqual(rem.itens.map((i) => i.forma).sort(), ["01", "41"]);
  const linhas = rem.conteudo.split("\r\n").filter(Boolean);
  assert.ok(linhas.every((l) => l.length === 240));
  const sn = Object.fromEntries(rem.itens.map((i) => [i.contaPagarId, `SP${i.id}`]));

  const ret = simularRetorno(rem.conteudo, { [sn[tA.id]]: "00", [sn[tB.id]]: "CN" }, { [sn[tA.id]]: 1500.5 });
  const cont = contagemVazia();
  await db.$transaction((tx) => aplicarRetornoTx(tx, lerRetornoSispag(ret), cont));
  assert.equal(cont.pagos, 1);
  assert.equal(cont.rejeitados, 1);

  const a = await db.contaPagar.findUniqueOrThrow({ where: { id: tA.id } });
  assert.equal(a.status, "PAGO");
  assert.equal(Number(a.valorPago), 1500.5);
  const lan = await db.lancamento.findMany({ where: { contaPagarId: tA.id } });
  assert.equal(lan.length, 1);
  assert.equal(lan[0].contaId, conta.id);
  assert.equal(lan[0].sentido, "SAIDA");
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: tB.id } })).status, "ABERTO");
  assert.equal((await db.remessaPagamentoItem.findFirstOrThrow({ where: { contaPagarId: tB.id } })).status, "REJEITADO");

  // reprocessar o mesmo retorno não muda nada
  await db.$transaction((tx) => aplicarRetornoTx(tx, lerRetornoSispag(ret), contagemVazia()));
  assert.equal(await db.lancamento.count({ where: { contaPagarId: tA.id } }), 1);

  // o título rejeitado volta a poder entrar em nova remessa
  await db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd, modo: "TED_BOLETO", dataPagto: hoje, ids: [tB.id] }));
});

test("SISPAG Pix: remessa própria com forma 45, retorno pago baixa o título como Pix", async () => {
  const t = await titulo(fPix, 99.9);
  const r = await db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd, modo: "PIX", dataPagto: hoje, ids: [t.id] }));
  const rem = await db.remessaPagamento.findUniqueOrThrow({ where: { id: r.remessaId }, include: { itens: true } });
  assert.equal(rem.itens[0].forma, "45");
  assert.ok(rem.conteudo.includes("pix@forn.com.br".toLowerCase()) || rem.conteudo.toLowerCase().includes("pix@forn.com.br"));
  const sn = `SP${rem.itens[0].id}`;
  const ret = simularRetorno(rem.conteudo, { [sn]: "00" }, { [sn]: 99.9 });
  await db.$transaction((tx) => aplicarRetornoTx(tx, lerRetornoSispag(ret), contagemVazia()));
  const x = await db.contaPagar.findUniqueOrThrow({ where: { id: t.id }, include: { lancamentos: true } });
  assert.equal(x.status, "PAGO");
  assert.equal(x.lancamentos[0].forma, "PIX");
});

test("retorno de outra conta é recusado e nada é baixado; da conta certa passa", async () => {
  const t = await titulo(fItau, 77);
  const r = await db.$transaction((tx) => gerarRemessaTx(tx, { conta, cd, modo: "TED_BOLETO", dataPagto: hoje, ids: [t.id] }));
  const rem = await db.remessaPagamento.findUniqueOrThrow({ where: { id: r.remessaId }, include: { itens: true } });
  const sn = `SP${rem.itens[0].id}`;
  const ret = simularRetorno(rem.conteudo, { [sn]: "00" }, { [sn]: 77 });
  assert.deepEqual(contaDoRetorno(ret), { agencia: "1234", conta: "12345", dac: "6" });
  const outra = ret.split("\r\n").map((l, i) => (i === 0 ? put(l, 53, "09999") : l)).join("\r\n");
  await assert.rejects(db.$transaction((tx) => aplicarRetornoTx(tx, lerRetornoSispag(outra), contagemVazia(), contaDoRetorno(outra))), /agência 9999/);
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } })).status, "ABERTO");
  await db.$transaction((tx) => aplicarRetornoTx(tx, lerRetornoSispag(ret), contagemVazia(), contaDoRetorno(ret)));
  assert.equal((await db.contaPagar.findUniqueOrThrow({ where: { id: t.id } })).status, "PAGO");
});
