/** Títulos gerados por outros módulos passam pela API pública do financeiro: mês fechado recusa recebimento e NF (e nada fica gravado). */
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { hojeUTC } from "@/lib/datas";
import { faturarCirurgia } from "@/app/(app)/comercial/_lib/faturamento";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { receberItemTx } from "@/app/(app)/compras/_lib/recebimento";
import { dia, limparTudo, mkFornecedor, mkHospital, mkLote, mkProduto, P, uid } from "./_util";

const MES_NF = "2025-03";
const AGORA_NF = new Date("2025-03-15T15:00:00Z");
const MES_HOJE = hojeUTC().toISOString().slice(0, 7);
let mesHojeJaFechado = false;

before(async () => {
  await limparTudo();
  await db.fechamentoMes.deleteMany({ where: { mes: MES_NF } });
  mesHojeJaFechado = !!(await db.fechamentoMes.findUnique({ where: { mes: MES_HOJE } }));
});
after(async () => {
  await db.fechamentoMes.deleteMany({ where: { mes: MES_NF } });
  if (!mesHojeJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_HOJE } });
  await limparTudo();
  await db.$disconnect();
});

test("recebimento recusa quando o mês da competência (hoje) está fechado e não grava nada", async () => {
  const fornecedorId = (await mkFornecedor()).id;
  const prod = await mkProduto();
  const ped = await db.pedidoCompra.create({ data: { fornecedorId, itens: { create: [{ produtoId: prod.id, quantidade: 5, custoUnit: 10 }] } }, include: { itens: true } });
  if (!mesHojeJaFechado) await db.fechamentoMes.create({ data: { mes: MES_HOJE } });
  try {
    await assert.rejects(
      db.$transaction((tx) => receberItemTx(tx, { itemId: ped.itens[0].id, quantidade: 2, lote: "LFECH", validade: dia(365), fabricacao: null, serie: null, usuario: "t" })),
      /está fechado/,
    );
  } finally {
    if (!mesHojeJaFechado) await db.fechamentoMes.deleteMany({ where: { mes: MES_HOJE } });
  }
  assert.equal(await db.contaPagar.count({ where: { pedidoId: ped.id } }), 0);
  assert.equal(await db.lote.count({ where: { produtoId: prod.id } }), 0);
  assert.equal((await db.pedidoCompraItem.findUniqueOrThrow({ where: { id: ped.itens[0].id } })).recebido, 0);
});

test("registrar NF recusa competência em mês fechado e o pedido continua ABERTO", async () => {
  const medicoId = (await db.medico.create({ data: { nome: `${P} medico`, crm: uid(), ufCrm: "SP" } })).id;
  const hosp = await mkHospital();
  const prod = await mkProduto({ custoMedio: 10, precoBase: 100 });
  const lote = await mkLote(prod.id);
  const cir = await db.cirurgia.create({
    data: { dataHora: new Date(), hospitalId: hosp.id, medicoId, paciente: `${P} paciente`, status: "REALIZADA", consumos: { create: [{ produtoId: prod.id, loteId: lote.id, quantidade: 1 }] } },
  });
  const pv = await db.$transaction((tx) => faturarCirurgia(tx, cir.id));
  await db.fechamentoMes.create({ data: { mes: MES_NF } });
  await assert.rejects(db.$transaction((tx) => registrarNfTx(tx, pv.id, "NF-FECH", dia(30), AGORA_NF)), /está fechado/);
  assert.equal((await db.pedidoVenda.findUniqueOrThrow({ where: { id: pv.id } })).status, "ABERTO");
  assert.equal(await db.contaReceber.count({ where: { pedidoId: pv.id } }), 0);
  await db.fechamentoMes.delete({ where: { mes: MES_NF } });
  const cr = await db.$transaction((tx) => registrarNfTx(tx, pv.id, "NF-FECH", dia(30), AGORA_NF)); // reaberto: passa
  assert.equal(cr.pedidoId, pv.id);
});
