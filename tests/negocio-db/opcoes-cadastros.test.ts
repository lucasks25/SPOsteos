/** API pública de cadastros (ARQ-10): opções de selects — só ativos por padrão, inativos com apenasAtivos=false, ordenadas por nome. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { nomeHospital, opcoesConvenios, opcoesHospitais, opcoesMedicos, opcoesRepresentantes, produtosParaVenda } from "@/app/(app)/cadastros/_lib/publico";
import { limparTudo, P, uid } from "./_util";

before(limparTudo);
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const meus = (ops: { value: string; label: string }[], ids: string[]) => ops.filter((o) => ids.includes(o.value));

test("hospitais: só ativos por padrão, inativo entra com apenasAtivos=false, ordem por razão social", async () => {
  const mk = (razaoSocial: string, ativo: boolean, nomeFantasia?: string) =>
    db.hospital.create({ data: { razaoSocial, nomeFantasia, ativo, cnpj: `8${Date.now()}${uid()}`.replace(/\D/g, "").slice(0, 14).padEnd(14, "0") } });
  const b = await mk(`${P} hospital B ${uid()}`, true, "Fantasia B");
  const a = await mk(`${P} hospital A ${uid()}`, true);
  const x = await mk(`${P} hospital X ${uid()}`, false);
  const ids = [a.id, b.id, x.id];

  const ativos = meus(await opcoesHospitais(), ids);
  assert.deepEqual(ativos.map((o) => o.value), [a.id, b.id], "ordenado por razão social; inativo fora");
  assert.equal(ativos[0].label, a.razaoSocial, "sem fantasia usa a razão social");
  assert.equal(ativos[1].label, "Fantasia B", "nome fantasia tem prioridade");
  assert.equal(nomeHospital(b), "Fantasia B");

  const todos = meus(await opcoesHospitais(false), ids);
  assert.deepEqual(todos.map((o) => o.value), [a.id, b.id, x.id], "com apenasAtivos=false o inativo vinculado aparece");
});

test("médicos, representantes e convênios: ativos, inativos opcionais e ordenação por nome", async () => {
  const s = uid();
  const m2 = await db.medico.create({ data: { nome: `${P} Médico B`, crm: `B${s}`, ufCrm: "SP" } });
  const m1 = await db.medico.create({ data: { nome: `${P} Médico A`, crm: `A${s}`, ufCrm: "SP" } });
  const mx = await db.medico.create({ data: { nome: `${P} Médico X`, crm: `X${s}`, ufCrm: "SP", ativo: false } });
  const mIds = [m1.id, m2.id, mx.id];
  assert.deepEqual(meus(await opcoesMedicos(), mIds).map((o) => o.value), [m1.id, m2.id]);
  const todosM = meus(await opcoesMedicos(false), mIds);
  assert.deepEqual(todosM.map((o) => o.value), [m1.id, m2.id, mx.id]);
  assert.equal(todosM[0].label, `${P} Médico A — CRM A${s}/SP`);

  const r2 = await db.representante.create({ data: { nome: `${P} Rep B` } });
  const r1 = await db.representante.create({ data: { nome: `${P} Rep A` } });
  const rx = await db.representante.create({ data: { nome: `${P} Rep X`, ativo: false } });
  const rIds = [r1.id, r2.id, rx.id];
  assert.deepEqual(meus(await opcoesRepresentantes(), rIds).map((o) => o.value), [r1.id, r2.id]);
  assert.deepEqual(meus(await opcoesRepresentantes(false), rIds).map((o) => o.value), [r1.id, r2.id, rx.id]);

  const c2 = await db.convenio.create({ data: { nome: `${P} Conv B` } });
  const c1 = await db.convenio.create({ data: { nome: `${P} Conv A` } });
  const cx = await db.convenio.create({ data: { nome: `${P} Conv X`, ativo: false } });
  assert.deepEqual(meus(await opcoesConvenios(), [c1.id, c2.id, cx.id]).map((o) => o.value), [c1.id, c2.id], "convênios: só ativos");
});

test("produtosParaVenda: só ativos, ordenados por descrição, preço como número", async () => {
  const s = uid();
  const p2 = await db.produto.create({ data: { codigo: `${P}-${s}-2`, descricao: `${P} prod B`, precoBase: 12.5 } });
  const p1 = await db.produto.create({ data: { codigo: `${P}-${s}-1`, descricao: `${P} prod A`, precoBase: 7 } });
  const px = await db.produto.create({ data: { codigo: `${P}-${s}-3`, descricao: `${P} prod X`, precoBase: 1, ativo: false } });
  const ids = [p1.id, p2.id, px.id];
  const lista = (await produtosParaVenda()).filter((p) => ids.includes(p.id));
  assert.deepEqual(lista.map((p) => p.id), [p1.id, p2.id]);
  assert.equal(lista[1].precoBase, 12.5);
  assert.equal(typeof lista[0].precoBase, "number");
});
