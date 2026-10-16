/** Helpers dos testes de integração de negócio (estoque/compras/comercial). Dados com prefixo TESTEDB. */
import "dotenv/config";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { hashDadosPagamento } from "@/app/(app)/financeiro/_lib/favorecidos-aprovacao";

import { hojeUTC } from "@/lib/datas";

export const P = "TESTEDB";
export const num = (v: unknown) => Number(String(v ?? 0));
/** Dia de hoje em Brasília (como o sistema) mais `offsetDias`, à meia-noite UTC. O dia UTC diverge entre 21h e 24h de Brasília. */
export const dia = (offsetDias: number) => new Date(hojeUTC().getTime() + offsetDias * 86400000);
let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Apaga tudo que os testes criam (ordem respeita as FKs). */
export async function limparTudo() {
  await limparDocumentos();
  const prod = { produto: { codigo: { startsWith: P } } };
  const hosp = { razaoSocial: { startsWith: P } };
  await db.glosa.deleteMany({ where: { contaReceber: { OR: [{ descricao: { startsWith: P } }, { hospital: hosp }] } } });
  await db.contaReceber.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.contaReceber.deleteMany({ where: { hospital: hosp } });
  await db.contaPagar.deleteMany({ where: { fornecedor: { razaoSocial: { startsWith: P } } } });
  await db.contaPagar.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.inventarioConsignacao.deleteMany({ where: { hospital: hosp } }); // itens em cascata
  await db.recolhimento.deleteMany({ where: { OR: [{ lotes: { some: { lote: prod } } }, { motivo: { startsWith: P } }] } }); // lotes, alvos, pacientes e ações em cascata
  await db.remessaItem.deleteMany({ where: prod });
  await db.remessa.deleteMany({ where: { OR: [{ local: { hospital: hosp } }, { cirurgia: { paciente: { startsWith: P } } }] } });
  await db.pedidoVenda.deleteMany({ where: { hospital: hosp } });
  await db.cirurgia.deleteMany({ where: { paciente: { startsWith: P } } }); // consumos e autorizações em cascata
  await db.convenio.deleteMany({ where: { nome: { startsWith: P } } });
  await db.procedimento.deleteMany({ where: { descricao: { startsWith: P } } });
  await db.movimento.deleteMany({ where: prod });
  await db.saldo.deleteMany({ where: prod });
  await db.pedidoCompra.deleteMany({ where: { fornecedor: { razaoSocial: { startsWith: P } } } });
  await db.tabelaPrecoItem.deleteMany({ where: prod });
  await db.lote.deleteMany({ where: prod });
  await db.produto.deleteMany({ where: { codigo: { startsWith: P } } });
  await db.localEstoque.deleteMany({ where: { hospital: hosp } });
  await db.hospital.deleteMany({ where: hosp });
  await db.tabelaPreco.deleteMany({ where: { nome: { startsWith: P } } });
  await db.representante.deleteMany({ where: { nome: { startsWith: P } } });
  await db.medico.deleteMany({ where: { nome: { startsWith: P } } });
  await db.fornecedor.deleteMany({ where: { razaoSocial: { startsWith: P } } });
}

export const mkProduto = (o: { custoMedio?: number; precoBase?: number } = {}) =>
  db.produto.create({ data: { codigo: `${P}-${uid()}`, descricao: `${P} produto`, custoMedio: o.custoMedio ?? 0, precoBase: o.precoBase ?? 0 } });

export const mkLote = (produtoId: string, o: { validadeDias?: number; status?: "LIBERADO" | "QUARENTENA" | "BLOQUEADO"; numero?: string } = {}) =>
  db.lote.create({ data: { produtoId, numero: o.numero ?? `L${uid()}`, validade: dia(o.validadeDias ?? 365), status: o.status ?? "LIBERADO" } });

export const mkHospital = (o: { tabelaPrecoId?: string } = {}) =>
  db.hospital.create({ data: { razaoSocial: `${P} hospital ${uid()}`, cnpj: `9${Date.now()}${seq++}`.slice(0, 14).padEnd(14, "0"), tabelaPrecoId: o.tabelaPrecoId } });

export const mkFornecedor = () =>
  db.fornecedor.create({ data: { razaoSocial: `${P} fornecedor ${uid()}`, cnpj: `7${String(Date.now()).slice(-8)}${String(seq++).padStart(5, "0")}` } });

export const saldoDe = async (loteId: string, localId: string) =>
  (await db.saldo.findUnique({ where: { loteId_localId: { loteId, localId } } }))?.quantidade ?? 0;

/** Invariante: Σ saldos do lote (todos os locais) == Σ kardex (destino − origem), e nenhum saldo negativo. */
export async function conferirKardex(loteId: string) {
  const saldos = await db.saldo.findMany({ where: { loteId } });
  const movs = await db.movimento.findMany({ where: { loteId } });
  const porLocal = new Map<string, number>();
  for (const m of movs) {
    if (m.destinoId) porLocal.set(m.destinoId, (porLocal.get(m.destinoId) ?? 0) + m.quantidade);
    if (m.origemId) porLocal.set(m.origemId, (porLocal.get(m.origemId) ?? 0) - m.quantidade);
  }
  for (const s of saldos) {
    assert.ok(s.quantidade >= 0, "saldo negativo");
    assert.equal(s.quantidade, porLocal.get(s.localId) ?? 0, `saldo do local ${s.localId} diverge do kardex`);
    porLocal.delete(s.localId);
  }
  for (const [l, q] of porLocal) assert.equal(q, 0, `kardex tem ${q} no local ${l} sem saldo`);
}

export async function contagens() {
  return {
    produto: await db.produto.count(),
    lote: await db.lote.count(),
    saldo: await db.saldo.count(),
    movimento: await db.movimento.count(),
    pedidoVenda: await db.pedidoVenda.count(),
    pedidoCompra: await db.pedidoCompra.count(),
    remessa: await db.remessa.count(),
    cirurgia: await db.cirurgia.count(),
    contaPagar: await db.contaPagar.count(),
    contaReceber: await db.contaReceber.count(),
    hospital: await db.hospital.count(),
    localEstoque: await db.localEstoque.count(),
  };
}

/** Documentos de teste (título TESTEDB ou ligados a fornecedor/fabricante/produto TESTEDB), seus arquivos no banco e no disco. */
export async function limparDocumentos() {
  const docs = await db.documento.findMany({
    where: { OR: [{ titulo: { startsWith: P } }, { fornecedor: { razaoSocial: { startsWith: P } } }, { fabricante: { nome: { startsWith: P } } }, { produto: { codigo: { startsWith: P } } }] },
    select: { id: true },
  });
  const ids = docs.map((d) => d.id);
  if (ids.length === 0) return;
  await db.documento.updateMany({ where: { id: { in: ids } }, data: { substituidoPorId: null, substituidoEm: null } });
  await db.documentoArquivo.deleteMany({ where: { documentoId: { in: ids } } });
  await db.documento.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) await rm(path.join(process.cwd(), "storage", "uploads", "documentos", id), { recursive: true, force: true });
}

/**
 * Marca como aprovados os dados de pagamento dos fornecedores de teste (prefixo TESTEDB). Fixtures gravam banco/Pix
 * direto no banco; sem isto o SISPAG recusa o favorecido. A aprovação de verdade é testada em favorecidos-aprovacao.test.ts.
 */
export async function aprovarFavorecidosTeste() {
  const fs = await db.fornecedor.findMany({ where: { razaoSocial: { startsWith: P } } });
  for (const f of fs) await db.fornecedor.update({ where: { id: f.id }, data: { pagamentoAprovadoHash: hashDadosPagamento(f) } });
}
