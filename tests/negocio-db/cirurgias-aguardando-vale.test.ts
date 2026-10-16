/** Fila do estoque "Cirurgias aguardando vale": status, remessa ativa/cancelada e filtros. Apaga o que cria. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { localDoHospital } from "@/lib/estoque";
import { cirurgiasAguardandoVale } from "@/app/(app)/estoque/_lib/cirurgias-aguardando";
import { diaSP } from "@/lib/datas";
import { limparTudo, mkHospital, P } from "./_util";
import { uid } from "./_util";

let h1: string, h2: string, l1: string, medicoId: string;
const DIA = 86400000;

before(async () => {
  await limparTudo();
  h1 = (await mkHospital()).id;
  h2 = (await mkHospital()).id;
  l1 = await db.$transaction((tx) => localDoHospital(tx, h1));
  medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
});
after(async () => {
  await limparTudo();
  await db.$disconnect();
});

const cir = (hospitalId: string, status: "AGENDADA" | "CONFIRMADA" | "REALIZADA" | "FATURADA" | "CANCELADA", dias = 3) =>
  db.cirurgia.create({ data: { dataHora: new Date(Date.now() + dias * DIA), hospitalId, medicoId, paciente: `${P} ${status}`, status } });
const remessa = (cirurgiaId: string, status: "ABERTA" | "ENVIADA" | "CONFERIDA" | "CANCELADA") =>
  db.remessa.create({ data: { localId: l1, cirurgiaId, status } });
const ids = async (f = {}) => new Set((await cirurgiasAguardandoVale(db, f)).map((c) => c.id));

test("lista só AGENDADA/CONFIRMADA; REALIZADA, FATURADA e CANCELADA ficam de fora", async () => {
  const a = await cir(h1, "AGENDADA"), c = await cir(h1, "CONFIRMADA");
  const fora = [await cir(h1, "REALIZADA"), await cir(h1, "FATURADA"), await cir(h1, "CANCELADA")];
  const r = await ids({ hospitalId: h1 });
  assert.ok(r.has(a.id) && r.has(c.id));
  for (const f of fora) assert.ok(!r.has(f.id));
});

test("remessa ativa tira da lista; remessa cancelada devolve", async () => {
  for (const st of ["ABERTA", "ENVIADA", "CONFERIDA"] as const) {
    const c = await cir(h1, "CONFIRMADA");
    await remessa(c.id, st);
    assert.ok(!(await ids({ hospitalId: h1 })).has(c.id), st);
  }
  const c = await cir(h1, "AGENDADA");
  await remessa(c.id, "CANCELADA");
  assert.ok((await ids({ hospitalId: h1 })).has(c.id));
  await remessa(c.id, "ABERTA"); // nova remessa ativa após a cancelada
  assert.ok(!(await ids({ hospitalId: h1 })).has(c.id));
});

test("filtros de hospital e período", async () => {
  const perto = await cir(h1, "AGENDADA", 2), longe = await cir(h1, "AGENDADA", 20), outro = await cir(h2, "AGENDADA", 2);
  const doH1 = await ids({ hospitalId: h1 });
  assert.ok(doH1.has(perto.id) && doH1.has(longe.id) && !doH1.has(outro.id));
  const ate = diaSP(new Date(Date.now() + 5 * DIA));
  const janela = await ids({ hospitalId: h1, ate });
  assert.ok(janela.has(perto.id) && !janela.has(longe.id));
  const depois = await ids({ hospitalId: h1, de: diaSP(new Date(Date.now() + 10 * DIA)) });
  assert.ok(!depois.has(perto.id) && depois.has(longe.id));
  assert.ok((await ids({ hospitalId: h2 })).has(outro.id));
});
