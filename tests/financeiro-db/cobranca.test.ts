/**
 * Cobrança dos hospitais (CNAB 400 Itaú) contra o banco: remessa → retorno simulado (confirmação, liquidação com baixa
 * automática, rejeição) → reprocesso, duplicidade, pedido de baixa e cancelamento. O retorno é montado a partir da própria
 * remessa; só um arquivo real do Itaú valida o formato de verdade.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { addDias, hojeUTC } from "@/lib/datas";
import { dacNossoNumero, lerRetornoCobranca } from "@/app/(app)/financeiro/_lib/cobranca";
import { aplicarRetornoCobrancaTx, cancelarRemessaCobrancaTx, contagemCobrancaVazia, gerarRemessaCobrancaTx } from "@/app/(app)/financeiro/_lib/cobranca-servico";

const hoje = hojeUTC();
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
let contaId: string, hospitalId: string, semEndId: string;

async function limpar() {
  const itens = await db.remessaCobrancaItem.findMany({ where: { contaReceber: { descricao: { startsWith: "TESTEDB" } } }, select: { remessaId: true } });
  await db.remessaCobranca.deleteMany({ where: { id: { in: itens.map((i) => i.remessaId) } } });
  await db.remessaCobranca.deleteMany({ where: { conta: { nome: { startsWith: "TESTEDB" } } } });
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  const contas = await db.contaBancaria.findMany({ where: { nome: { startsWith: "TESTEDB" } }, select: { id: true } });
  await db.cobrancaEvento.deleteMany({ where: { contaId: { in: contas.map((c) => c.id) } } });
  await db.extratoLinha.deleteMany({ where: { contaId: { in: contas.map((c) => c.id) } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.hospital.deleteMany({ where: { razaoSocial: { startsWith: "TESTEDB" } } });
}
before(async () => {
  await limpar();
  contaId = (await db.contaBancaria.create({ data: { nome: "TESTEDB cobranca", tipo: "BANCO", banco: "341", agencia: "0099", numero: "990012", titularCnpj: "12345678000195", titularNome: "EMPRESA TESTE", carteiraCobranca: "109", saldoInicial: 0 } })).id;
  hospitalId = (await db.hospital.create({ data: { razaoSocial: "TESTEDB Hospital", cnpj: "11222333000181", endereco: "Rua das Flores 100", bairro: "Centro", cep: "01001000", cidade: "Sao Paulo", uf: "SP" } })).id;
  semEndId = (await db.hospital.create({ data: { razaoSocial: "TESTEDB Sem Endereco", cnpj: "22333444000172" } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = (valor: number, o: { hospital?: string; venc?: number } = {}) =>
  db.contaReceber.create({ data: { descricao: "TESTEDB receber", valor, vencimento: addDias(hoje, o.venc ?? 10), competencia: hoje, hospitalId: o.hospital ?? hospitalId } });
const gerar = (ids: string[], baixaIds: string[] = []) => tx((x) => gerarRemessaCobrancaTx(x, { contaId, ids, baixaIds }));
const put = (s: string, ini: number, v: string) => s.slice(0, ini - 1) + v + s.slice(ini - 1 + v.length);
const ddmmaa = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCFullYear()).slice(2)}`;
const v13 = (n: number) => String(Math.round(n * 100)).padStart(13, "0");
const BEN = { agencia: "0099", conta: "99001", carteira: "109" as const };

/** retorno a partir da remessa: um evento por registro tipo 1 (na ordem), com ocorrência e campos pedidos. */
function simular(remessa: string, eventos: { nn: string; cod: string; extra?: [number, string][] }[]) {
  const R = remessa.split("\r\n").filter(Boolean);
  const detalhes = R.filter((l) => l[0] === "1");
  const linhas = [put(put(R[0], 2, "2RETORNO"), 109, "00042" + ddmmaa(hoje))];
  let total = 0;
  for (const e of eventos) {
    const rem = detalhes.find((l) => l.slice(62, 70) === e.nn)!;
    let l = put(rem.slice(0, 62) + " ".repeat(338), 30, " ".repeat(8));
    l = put(l, 83, "109" + e.nn + String(dacNossoNumero(BEN, e.nn)));
    l = put(l, 108, "I");
    l = put(l, 117, rem.slice(110, 120));
    l = put(l, 127, e.nn);
    l = put(l, 147, rem.slice(120, 126) + rem.slice(126, 139) + "341");
    l = put(l, 109, e.cod + ddmmaa(hoje));
    for (const [ini, v] of e.extra ?? []) l = put(l, ini, v);
    total += Number(l.slice(152, 165));
    linhas.push(l);
  }
  let t = put(" ".repeat(400), 1, "9201341");
  t = put(t, 213, String(eventos.length).padStart(8, "0") + String(total).padStart(14, "0"));
  linhas.push(t);
  return linhas.map((l, i) => put(l, 395, String(i + 1).padStart(6, "0"))).join("\r\n") + "\r\n";
}

const ler = (txt: string) => lerRetornoCobranca(txt);
const aplicar = async (txt: string) => {
  const cont = contagemCobrancaVazia();
  await tx((x) => aplicarRetornoCobrancaTx(x, ler(txt), cont));
  return cont;
};
const lerT = (id: string) => db.contaReceber.findUniqueOrThrow({ where: { id } });

test("remessa: numera o nosso número em sequência, marca o título e recusa hospital sem endereço e vencimento passado", async () => {
  const a = await titulo(1000);
  const b = await titulo(500);
  const r = await gerar([a.id, b.id]);
  const rem = await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId }, include: { itens: true } });
  assert.ok(rem.conteudo.split("\r\n").filter(Boolean).every((l) => l.length === 400));
  const nns = (await db.contaReceber.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { nossoNumero: "asc" } })).map((t) => [t.nossoNumero, t.cobrancaStatus]);
  assert.equal(nns[0][1], "ENVIADO");
  assert.equal(Number(nns[1][0]) - Number(nns[0][0]), 1);
  await assert.rejects(gerar([a.id]), /já tem cobrança/);
  const semEnd = await titulo(100, { hospital: semEndId });
  await assert.rejects(gerar([semEnd.id]), /falta no cadastro do hospital endereço/);
  const vencido = await titulo(100, { venc: -2 });
  await assert.rejects(gerar([vencido.id]), /vencimento já passou/);
});

test("duas remessas simultâneas do mesmo título: só uma passa", async () => {
  const t = await titulo(300);
  const r = await Promise.allSettled([gerar([t.id]), gerar([t.id])]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});

test("retorno: confirma, liquida com baixa automática (juros e desconto), reprocesso não duplica", async () => {
  const t = await titulo(1000);
  const u = await titulo(2000);
  const r = await gerar([t.id, u.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const nn = async (id: string) => (await lerT(id)).nossoNumero!;
  const [nt, nu] = [await nn(t.id), await nn(u.id)];

  const conf = simular(remessa, [{ nn: nt, cod: "02", extra: [[378, "01      "]] }, { nn: nu, cod: "02", extra: [[378, "01      "]] }]);
  const c1 = await aplicar(conf);
  assert.equal(c1.registrados, 2);
  assert.equal((await lerT(t.id)).cobrancaStatus, "REGISTRADO");

  // hospital paga t com R$ 12,50 de juros; u com R$ 100 de desconto
  const liq = simular(remessa, [
    { nn: nt, cod: "06", extra: [[153, v13(1000)], [254, v13(1012.5)], [296, ddmmaa(hoje)]] },
    { nn: nu, cod: "06", extra: [[153, v13(2000)], [241, v13(100)], [254, v13(1900)], [296, ddmmaa(hoje)]] },
  ]);
  const c2 = await aplicar(liq);
  assert.equal(c2.liquidados, 2);
  const x = await lerT(t.id);
  assert.equal(x.status, "PAGO");
  assert.equal(Number(x.valorPago), 1012.5);
  const lx = await db.lancamento.findFirstOrThrow({ where: { contaReceberId: t.id } });
  assert.equal(Number(lx.juros), 12.5);
  assert.equal(lx.contaId, contaId);
  const y = await lerT(u.id);
  assert.equal(y.status, "PAGO");
  assert.equal(Number(y.valorPago), 1900);
  assert.equal(Number((await db.lancamento.findFirstOrThrow({ where: { contaReceberId: u.id } })).desconto), 100);
  assert.equal(x.cobrancaStatus, "LIQUIDADO");

  const c3 = await aplicar(liq); // mesmo arquivo de novo
  assert.equal(c3.jaProcessados, 2);
  assert.equal(await db.lancamento.count({ where: { contaReceberId: t.id } }), 1);
});

test("rejeição libera para nova remessa com outro nosso número; pagamento de título já quitado é duplicidade", async () => {
  const t = await titulo(800);
  const r = await gerar([t.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const n1 = (await lerT(t.id)).nossoNumero!;
  await aplicar(simular(remessa, [{ nn: n1, cod: "03", extra: [[378, "0811    "]] }]));
  assert.equal((await lerT(t.id)).cobrancaStatus, "REJEITADO");
  await gerar([t.id]); // pode de novo
  const n2 = (await lerT(t.id)).nossoNumero!;
  assert.notEqual(n1, n2);

  // paga à mão e depois o banco liquida o boleto: dinheiro entrou duas vezes
  const remessa2 = (await db.remessaCobranca.findFirstOrThrow({ where: { itens: { some: { contaReceberId: t.id, nossoNumero: n2 } } } })).conteudo;
  await aplicar(simular(remessa2, [{ nn: n2, cod: "02" }]));
  await tx(async (x) => {
    const { registrarBaixa } = await import("@/app/(app)/financeiro/_lib/titulos");
    await registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId, data: hoje, valor: 800 });
  });
  const c = await aplicar(simular(remessa2, [{ nn: n2, cod: "06", extra: [[153, v13(800)], [254, v13(800)], [296, ddmmaa(hoje)]] }]));
  assert.equal(c.duplicados, 1);
  assert.equal(await db.lancamento.count({ where: { contaReceberId: t.id } }), 1);
  const it = await db.remessaCobrancaItem.findFirstOrThrow({ where: { contaReceberId: t.id, nossoNumero: n2 } });
  assert.match(it.motivos ?? "", /DUP/);
});

test("pedido de baixa só de boleto registrado; cancelar remessa libera", async () => {
  const t = await titulo(400);
  const r = await gerar([t.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const nn = (await lerT(t.id)).nossoNumero!;
  await assert.rejects(gerar([], [t.id]), /não tem boleto registrado/);
  await aplicar(simular(remessa, [{ nn, cod: "02" }]));
  await tx(async (x) => {
    const { registrarBaixa } = await import("@/app/(app)/financeiro/_lib/titulos");
    await registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId, data: hoje, valor: 400 });
  });
  const b = await gerar([], [t.id]);
  assert.equal((await lerT(t.id)).cobrancaStatus, "BAIXA_ENVIADA");
  await tx((x) => cancelarRemessaCobrancaTx(x, b.remessaId, "enviei errado"));
  assert.equal((await lerT(t.id)).cobrancaStatus, "REGISTRADO");

  const novo = await titulo(150);
  const r2 = await gerar([novo.id]);
  await tx((x) => cancelarRemessaCobrancaTx(x, r2.remessaId, "banco recusou o arquivo"));
  assert.equal((await lerT(novo.id)).cobrancaStatus, null);
  await gerar([novo.id]);
});

test("retorno de conta não cadastrada para cobrança é recusado", async () => {
  const t = await titulo(90);
  const r = await gerar([t.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const nn = (await lerT(t.id)).nossoNumero!;
  const txt = simular(remessa, [{ nn, cod: "02" }]).replace(/^(.{26})0099/, "$10098");
  await assert.rejects(aplicar(txt), /agência 0098|não é uma conta/);
});

// Varredura funcional (REVISAO §20): boleto baixado pelo banco (decurso de prazo) deixava o título em aberto sem como cobrar de novo.
test("boleto baixado pelo banco com título ainda em aberto: pode ir numa nova remessa com outro nosso número", async () => {
  const t = await titulo(450);
  const r = await gerar([t.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const n1 = (await lerT(t.id)).nossoNumero!;
  await aplicar(simular(remessa, [{ nn: n1, cod: "02" }]));
  await aplicar(simular(remessa, [{ nn: n1, cod: "09" }])); // baixa pelo banco
  const baixado = await lerT(t.id);
  assert.equal(baixado.cobrancaStatus, "BAIXADO");
  assert.equal(baixado.status, "ABERTO");
  await gerar([t.id]);
  const novo = await lerT(t.id);
  assert.notEqual(novo.nossoNumero, n1);
  assert.equal(novo.cobrancaStatus, "ENVIADO");
});

// ─── REVISAO §22: boleto registrado de título em aberto (baixa 02 e alteração de vencimento 06) e "já conciliado" ───

const gerarAlt = (alteracoes: { id: string; vencimento: Date }[], baixaIds: string[] = []) => tx((x) => gerarRemessaCobrancaTx(x, { contaId, ids: [], baixaIds, alteracoes }));
async function registrado(valor: number) {
  const t = await titulo(valor);
  const r = await gerar([t.id]);
  const remessa = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const nn = (await lerT(t.id)).nossoNumero!;
  await aplicar(simular(remessa, [{ nn, cod: "02" }]));
  return { t, remessa, nn };
}

test("alteração de vencimento (06): vai à remessa com o novo vencimento, trava o título e o retorno 14 aplica o vencimento", async () => {
  const { t, remessa, nn } = await registrado(700);
  const novo = addDias(hoje, 40);
  await assert.rejects(gerarAlt([{ id: t.id, vencimento: addDias(hoje, -1) }]), /anterior a hoje/);
  await assert.rejects(gerarAlt([{ id: t.id, vencimento: t.vencimento }]), /igual ao atual/);
  await assert.rejects(gerarAlt([{ id: t.id, vencimento: novo }], [t.id]), /mais de uma operação/);

  const r = await gerarAlt([{ id: t.id, vencimento: novo }]);
  const rem = await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId }, include: { itens: true } });
  const det = rem.conteudo.split("\r\n").find((l) => l[0] === "1")!;
  assert.equal(det.slice(108, 110), "06");
  assert.equal(det.slice(120, 126), ddmmaa(novo));
  assert.equal(det.slice(126, 139), v13(700)); // valor registrado
  assert.equal(rem.itens[0].vencimento?.getTime(), novo.getTime());
  const pend = await lerT(t.id);
  assert.equal(pend.cobrancaStatus, "ALTERACAO_ENVIADA");
  assert.equal(pend.vencimento.getTime(), t.vencimento.getTime(), "só muda quando o banco confirmar");

  const c = await aplicar(simular(remessa, [{ nn, cod: "14", extra: [[147, ddmmaa(novo)]] }]));
  assert.equal(c.alterados, 1);
  const depois = await lerT(t.id);
  assert.equal(depois.vencimento.getTime(), novo.getTime());
  assert.equal(depois.cobrancaStatus, "REGISTRADO");
  assert.equal((await db.remessaCobrancaItem.findUniqueOrThrow({ where: { id: rem.itens[0].id } })).status, "CONFIRMADO");
});

test("alteração recusada pelo banco volta a REGISTRADO sem mudar o vencimento; cancelar remessa de 06 também", async () => {
  const { t, remessa, nn } = await registrado(260);
  const r = await gerarAlt([{ id: t.id, vencimento: addDias(hoje, 20) }]);
  const c = await aplicar(simular(remessa, [{ nn, cod: "16", extra: [[378, "05      "]] }]));
  assert.equal(c.instrucoesRejeitadas, 1);
  const x = await lerT(t.id);
  assert.equal(x.cobrancaStatus, "REGISTRADO");
  assert.equal(x.vencimento.getTime(), t.vencimento.getTime());
  assert.equal((await db.remessaCobrancaItem.findFirstOrThrow({ where: { remessaId: r.remessaId } })).status, "REJEITADO");
  const r2 = await gerarAlt([{ id: t.id, vencimento: addDias(hoje, 25) }]);
  await tx((y) => cancelarRemessaCobrancaTx(y, r2.remessaId, "enviei errado"));
  assert.equal((await lerT(t.id)).cobrancaStatus, "REGISTRADO");
});

test("pedido de baixa (02) de título EM ABERTO: confirmado pelo banco, o título fica livre para boleto novo", async () => {
  const { t, remessa, nn } = await registrado(330);
  await gerar([], [t.id]);
  assert.equal((await lerT(t.id)).cobrancaStatus, "BAIXA_ENVIADA");
  await aplicar(simular(remessa, [{ nn, cod: "09" }]));
  const x = await lerT(t.id);
  assert.equal(x.cobrancaStatus, "BAIXADO");
  assert.equal(x.status, "ABERTO");
  await gerar([t.id]);
  assert.notEqual((await lerT(t.id)).nossoNumero, nn);
});

test("liquidação de título já baixado pela conciliação com o mesmo pagamento é 'já conciliado', não duplicidade", async () => {
  const { t, remessa, nn } = await registrado(510);
  await tx(async (x) => {
    const { registrarBaixa } = await import("@/app/(app)/financeiro/_lib/titulos");
    await registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId, data: hoje, valor: 510 });
  });
  const lanc = await db.lancamento.findFirstOrThrow({ where: { contaReceberId: t.id } });
  await db.extratoLinha.create({ data: { contaId, data: addDias(hoje, -2), valor: 510, descricao: "TESTEDB credito boleto", fitid: `TESTEDB-${t.id}`, lancamentoId: lanc.id, conciliadoEm: new Date() } });
  const c = await aplicar(simular(remessa, [{ nn, cod: "06", extra: [[153, v13(510)], [254, v13(510)], [296, ddmmaa(hoje)]] }]));
  assert.equal(c.jaConciliados, 1);
  assert.equal(c.duplicados, 0);
  assert.equal(await db.lancamento.count({ where: { contaReceberId: t.id } }), 1);
  const it = await db.remessaCobrancaItem.findFirstOrThrow({ where: { contaReceberId: t.id, nossoNumero: nn, ocorrencia: "01" } });
  assert.match(it.motivos ?? "", /CONC/);
  assert.doesNotMatch(it.motivos ?? "", /DUP/);
});

test("nota 31: a data de emissão (151-156) é a competência do título (dia da NF), não o dia da remessa", async () => {
  const t = await db.contaReceber.create({ data: { descricao: "TESTEDB receber NF antiga", valor: 400, vencimento: addDias(hoje, 20), competencia: addDias(hoje, -5), hospitalId } });
  const r = await gerar([t.id]);
  const rem = await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } });
  const det = rem.conteudo.split("\r\n").find((l) => l[0] === "1")!;
  assert.equal(det.slice(150, 156), ddmmaa(addDias(hoje, -5)));
  // competência no futuro (título manual): a emissão fica no dia da remessa
  const f = await db.contaReceber.create({ data: { descricao: "TESTEDB receber competencia futura", valor: 400, vencimento: addDias(hoje, 40), competencia: addDias(hoje, 30), hospitalId } });
  const r2 = await gerar([f.id]);
  const det2 = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r2.remessaId } })).conteudo.split("\r\n").find((l) => l[0] === "1")!;
  assert.equal(det2.slice(150, 156), ddmmaa(hoje));
});

test("baixa 10 depois da liquidação não desfaz o LIQUIDADO; 10/59 sem liquidação e cheque devolvido (69) viram alerta", async () => {
  const a = await titulo(300);
  const b = await titulo(200);
  const c = await titulo(100);
  const r = await gerar([a.id, b.id, c.id]);
  const rem = (await db.remessaCobranca.findUniqueOrThrow({ where: { id: r.remessaId } })).conteudo;
  const [na, nb, nc] = await Promise.all([a, b, c].map(async (t) => (await lerT(t.id)).nossoNumero!));
  await aplicar(simular(rem, [{ nn: na, cod: "02" }, { nn: nb, cod: "02" }, { nn: nc, cod: "02" }]));
  const cont = await aplicar(
    simular(rem, [
      { nn: na, cod: "06", extra: [[254, v13(300)], [296, ddmmaa(hoje)]] },
      { nn: na, cod: "10" },
      { nn: nb, cod: "59" },
      { nn: nc, cod: "69", extra: [[378, "11"]] },
    ]),
  );
  assert.equal(cont.liquidados, 1);
  assert.equal(cont.baixasComPagamento, 1);
  assert.equal(cont.chequesDevolvidos, 1);
  const [ta, tb, tc] = await Promise.all([lerT(a.id), lerT(b.id), lerT(c.id)]);
  assert.deepEqual([ta.status, ta.cobrancaStatus], ["PAGO", "LIQUIDADO"]);
  assert.deepEqual([tb.status, tb.cobrancaStatus], ["ABERTO", "BAIXADO"]); // não baixa sozinho: o dinheiro é conferido na conciliação
  assert.equal(tc.status, "ABERTO");
  const itens = await db.remessaCobrancaItem.findMany({ where: { remessaId: r.remessaId }, orderBy: { id: "asc" } });
  assert.match(itens.find((i) => i.contaReceberId === b.id)!.motivos ?? "", /B59/);
  assert.match(itens.find((i) => i.contaReceberId === c.id)!.motivos ?? "", /CHQDEV11/);
});
