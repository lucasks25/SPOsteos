/** Cadastro de linhas de produto: código único, inativar sem apagar nada, excluir só sem produto. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { alternarAtivoLinhaTx, excluirLinhaTx, salvarLinhaTx } from "@/app/(app)/cadastros/_lib/linhas-servico";
import { opcoesLinhas } from "@/app/(app)/cadastros/_lib/publico";
import { limparTudo, mkProduto, P, uid } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const dados = (codigo: string, extra: object = {}) => ({ codigo, nome: `${P} linha ${codigo}`, grupo: "Implantáveis", ordem: 5, ativo: true, ...extra });
const salvar = (id: string | null, d: ReturnType<typeof dados>) => db.$transaction((tx) => salvarLinhaTx(tx, id, d));

test("código único, em maiúsculas e sem espaços nas pontas; duplicado vira ErroNegocio", async () => {
  const cod = `${P}-${uid()}`.toUpperCase();
  const a = await salvar(null, dados(` ${cod.toLowerCase()} `));
  assert.equal(a.codigo, cod);
  await assert.rejects(() => salvar(null, dados(cod)), (e) => e instanceof ErroNegocio && /já existe a linha/i.test(e.message));
  // editar a própria linha mantendo o código não conflita
  const e = await salvar(a.id, dados(cod, { nome: `${P} renomeada` }));
  assert.equal(e.nome, `${P} renomeada`);
  // outra linha não pode tomar o código
  const b = await salvar(null, dados(`${cod}-B`));
  await assert.rejects(() => salvar(b.id, dados(cod)), ErroNegocio);
});

test("inativar não apaga nada: produto continua ligado, linha sai das opções ativas e volta ao reativar", async () => {
  const l = await salvar(null, dados(`${P}-${uid()}`.toUpperCase()));
  const prod = await mkProduto();
  await db.produto.update({ where: { id: prod.id }, data: { linhaId: l.id } });

  const inativa = await db.$transaction((tx) => alternarAtivoLinhaTx(tx, l.id));
  assert.equal(inativa.ativo, false);
  assert.equal((await db.produto.findUniqueOrThrow({ where: { id: prod.id } })).linhaId, l.id, "produto continua na linha");
  assert.ok(!(await opcoesLinhas()).some((o) => o.value === l.id), "inativa fora das opções ativas");
  assert.ok((await opcoesLinhas(false)).some((o) => o.value === l.id), "mas aparece nos filtros de relatório");

  const ativa = await db.$transaction((tx) => alternarAtivoLinhaTx(tx, l.id));
  assert.equal(ativa.ativo, true);
  assert.ok((await opcoesLinhas()).some((o) => o.value === l.id));
});

test("excluir: bloqueado com produto, permitido sem; linha inexistente é erro de negócio", async () => {
  const l = await salvar(null, dados(`${P}-${uid()}`.toUpperCase()));
  const prod = await mkProduto();
  await db.produto.update({ where: { id: prod.id }, data: { linhaId: l.id } });
  await assert.rejects(() => db.$transaction((tx) => excluirLinhaTx(tx, l.id)), (e) => e instanceof ErroNegocio && /1 produto/.test(e.message));
  assert.ok(await db.linhaProduto.findUnique({ where: { id: l.id } }));

  await db.produto.update({ where: { id: prod.id }, data: { linhaId: null } });
  await db.$transaction((tx) => excluirLinhaTx(tx, l.id));
  assert.equal(await db.linhaProduto.findUnique({ where: { id: l.id } }), null);
  await assert.rejects(() => db.$transaction((tx) => excluirLinhaTx(tx, l.id)), ErroNegocio);
});

test("as 12 linhas iniciais da SP OSTEOS estão no banco (migration)", async () => {
  const n = await db.linhaProduto.count({ where: { codigo: { in: ["COL-FIX", "COL-CAGE", "COL-DEF", "BIO-CIM", "BIO-ENX", "BIO-HEM", "BIO-VIS", "DOR", "END", "VTP", "COL-DESC", "INS"] } } });
  assert.equal(n, 12);
});
