/**
 * REVISAO §22: idempotência de formulário (token gerado na renderização, gravado na transação da mutação) e reserva FEFO
 * travada na criação do vale. Dados com prefixo TESTEDB.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { ErroNegocio } from "@/lib/erros";
import { MSG_JA_ENVIADO, novoTokenFormulario, registrarEnvioTx } from "@/lib/idempotencia";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { criarRemessa } from "@/app/(app)/estoque/_lib/remessas";
import { dia, limparTudo, mkFornecedor, mkHospital, mkLote, mkProduto } from "./_util";

const tokens: string[] = [];
const novo = () => {
  const t = novoTokenFormulario();
  tokens.push(t);
  return t;
};
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

before(limparTudo);
after(async () => {
  await db.formularioEnviado.deleteMany({ where: { token: { in: tokens } } });
  await limparTudo();
  await db.$disconnect();
});

test("token: segundo envio recusado; token inválido recusado; mutação que falha libera o token", async () => {
  const t = novo();
  await tx((x) => registrarEnvioTx(x, t, null));
  await assert.rejects(tx((x) => registrarEnvioTx(x, t, null)), (e: Error) => e instanceof ErroNegocio && e.message === MSG_JA_ENVIADO);
  await assert.rejects(tx((x) => registrarEnvioTx(x, null, null)), /recarregue a página/);
  await assert.rejects(tx((x) => registrarEnvioTx(x, "abc' OR 1=1", null)), /recarregue a página/);

  const u = novo();
  await assert.rejects(
    tx(async (x) => {
      await registrarEnvioTx(x, u, null);
      throw new ErroNegocio("validação do serviço falhou");
    }),
    /validação do serviço falhou/,
  );
  await tx((x) => registrarEnvioTx(x, u, null)); // a falha desfez a gravação: o usuário corrige e reenvia
});

test("token: dois envios simultâneos do mesmo formulário, só um grava", async () => {
  const t = novo();
  const r = await Promise.allSettled([1, 2, 3].map(() => tx((x) => registrarEnvioTx(x, t, null))));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});

test("recebimento parcial enviado duas vezes com o mesmo token (outra aba / voltar): entra uma vez só", async () => {
  const p = await mkProduto({ custoMedio: 10 });
  const f = await mkFornecedor();
  const pc = await db.pedidoCompra.create({ data: { fornecedorId: f.id, itens: { create: [{ produtoId: p.id, quantidade: 10, custoUnit: 10 }] } }, include: { itens: true } });
  const t = novo();
  const enviar = () =>
    tx(async (x) => {
      await registrarEnvioTx(x, t, null);
      await receberItemTx(x, { itemId: pc.itens[0].id, quantidade: 3, lote: `L${t.slice(0, 8)}`, validade: dia(400), fabricacao: null, serie: null, usuario: "teste" });
    });
  await enviar();
  await assert.rejects(enviar(), /já foi enviado; recarregue a página/);
  assert.equal((await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: pc.itens[0].id } })).recebido, 3);
});

test("os três formulários levam o token e as três actions o gravam na transação", async () => {
  const raiz = path.resolve(import.meta.dirname, "../../src/app/(app)");
  const pares: [string, string][] = [
    ["compras/pedidos/[id]/page.tsx", "compras/pedidos/actions.ts"],
    ["compras/pedidos/[id]/importacao.tsx", "compras/pedidos/importacao-actions.ts"],
    ["qualidade/recolhimentos/novo/page.tsx", "qualidade/recolhimentos/actions.ts"],
  ];
  for (const [tela, action] of pares) {
    assert.match(await readFile(path.join(raiz, tela), "utf8"), /<TokenFormulario \/>/, tela);
    assert.match(await readFile(path.join(raiz, action), "utf8"), /registrarEnvioTx\(tx, fd\.get\(CAMPO_TOKEN\), user\.id\)/, action);
  }
});

test("reserva FEFO: dois vales simultâneos do mesmo lote não reservam mais do que o disponível", async () => {
  const p = await mkProduto({ custoMedio: 10 });
  const l = await mkLote(p.id);
  const h = await mkHospital();
  await tx((x) => movimentar(x, { tipo: "ENTRADA", produtoId: p.id, loteId: l.id, quantidade: 5, destinoId: LOCAIS.DEPOSITO, custoUnit: 10 }));
  const criar = () => tx((x) => criarRemessa(x, { hospitalId: h.id, itens: [{ produtoId: p.id, loteId: l.id, quantidade: 3 }] }));
  const r = await Promise.allSettled([criar(), criar(), criar()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  const rej = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rej.reason.message), /disponível no depósito 2, solicitado 3/);
  const reservado = await db.remessaItem.aggregate({ where: { loteId: l.id, remessa: { status: "ABERTA" } }, _sum: { quantidade: true } });
  assert.equal(reservado._sum.quantidade, 3);
});
