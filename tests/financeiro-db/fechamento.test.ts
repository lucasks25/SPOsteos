/** Fechamento de mês contra o banco: depois de fechado, nada com data no mês passa. Usa jan/2026 e limpa tudo no final. */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { mesDoDia } from "@/app/(app)/financeiro/_lib/fechamento";
import { estornarBaixa, estornarGlosa, estornarTransferencia, registrarBaixa, registrarGlosa, transferir } from "@/app/(app)/financeiro/_lib/titulos";
import { garantirMesAberto } from "@/app/(app)/financeiro/_lib/fechamento";

const JAN = new Date("2026-01-15T00:00:00Z");
const FEV = new Date("2026-02-10T00:00:00Z");
let a: string, b: string, hospitalId: string;

async function limpar() {
  await db.lancamento.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.glosa.deleteMany({ where: { contaReceber: { descricao: { startsWith: "TESTEDB" } } } });
  await db.transferencia.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: "TESTEDB" } } });
  await db.contaBancaria.deleteMany({ where: { nome: { startsWith: "TESTEDB" } } });
  await db.fechamentoMes.deleteMany({ where: { mes: "2026-01" } });
}
before(async () => {
  await limpar();
  hospitalId = (await db.hospital.findFirstOrThrow({ select: { id: true } })).id;
  a = (await db.contaBancaria.create({ data: { nome: "TESTEDB A", saldoInicial: 10000 } })).id;
  b = (await db.contaBancaria.create({ data: { nome: "TESTEDB B", saldoInicial: 0 } })).id;
});
after(async () => {
  await limpar();
  await db.$disconnect();
});

const titulo = (valor: number, dia = JAN) => db.contaReceber.create({ data: { descricao: "TESTEDB receber", valor, vencimento: dia, competencia: dia, hospitalId } });
const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);

test("mesDoDia", () => assert.equal(mesDoDia(JAN), "2026-01"));

test("mês fechado recusa baixa, glosa, transferência e os estornos; mês aberto segue normal; reabrir libera", async () => {
  // antes de fechar: cria o que será estornado depois
  const t = await titulo(1000);
  const baixa = await tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId: a, data: JAN, valor: 300 }));
  const glosa = await tx((x) => registrarGlosa(x, { tituloId: t.id, valor: 100, data: JAN, motivo: "item não autorizado" }));
  const transf = await tx((x) => transferir(x, { origemId: a, destinoId: b, valor: 50, data: JAN, descricao: "TESTEDB transf" }));

  await db.fechamentoMes.create({ data: { mes: "2026-01" } });
  const fechado = /mês 01\/2026 está fechado/;
  await assert.rejects(tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId: a, data: JAN, valor: 100 })), fechado);
  await assert.rejects(tx((x) => registrarGlosa(x, { tituloId: t.id, valor: 10, data: JAN, motivo: "outra glosa aqui" })), fechado);
  await assert.rejects(tx((x) => transferir(x, { origemId: a, destinoId: b, valor: 10, data: JAN, descricao: "TESTEDB t2" })), fechado);
  await assert.rejects(tx((x) => estornarBaixa(x, "receber", baixa.id)), fechado);
  await assert.rejects(tx((x) => estornarGlosa(x, glosa.id)), fechado);
  await assert.rejects(tx((x) => estornarTransferencia(x, transf.id)), fechado);
  await assert.rejects(garantirMesAberto(db, [new Date("2026-03-01T00:00:00Z"), JAN], "criar título"), fechado);

  // fevereiro continua livre, mesmo para o mesmo título
  await tx((x) => registrarBaixa(x, { tipo: "receber", tituloId: t.id, contaId: a, data: FEV, valor: 100 }));

  // reabrir libera o estorno
  await db.fechamentoMes.delete({ where: { mes: "2026-01" } });
  await tx((x) => estornarBaixa(x, "receber", baixa.id));
});

test("o banco recusa mês mal formado", async () => {
  await assert.rejects(db.fechamentoMes.create({ data: { mes: "2026-13" } }), /formato|check constraint/i);
});
