import "server-only";
import type { TipoMovimento } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/**
 * Serviço central de estoque. TODA alteração de saldo deve passar por
 * `movimentar`, dentro de uma transação (`db.$transaction(async (tx) => ...)`),
 * para manter Saldo e Kardex (Movimento) consistentes.
 */
export type MovimentoInput = {
  tipo: TipoMovimento;
  produtoId: string;
  loteId: string;
  quantidade: number; // sempre positiva
  origemId?: string | null; // local de onde sai (null = entrada externa)
  destinoId?: string | null; // local para onde vai (null = saída externa: consumo/perda)
  custoUnit?: number;
  documento?: string;
  observacao?: string;
  usuario?: string;
};

export class EstoqueError extends ErroNegocio {}

async function ajustarSaldo(tx: Tx, produtoId: string, loteId: string, localId: string, delta: number) {
  // Atualização atômica no banco: o UPDATE trava a linha, soma e só vale se o saldo não ficar negativo.
  // (ler o saldo e gravar o valor absoluto perdia atualizações quando duas saídas rodavam ao mesmo tempo)
  const n = await tx.$executeRaw`UPDATE "Saldo" SET "quantidade" = "quantidade" + ${delta} WHERE "loteId" = ${loteId} AND "localId" = ${localId} AND "quantidade" + ${delta} >= 0`;
  if (n > 0) return;
  const existe = await tx.saldo.findUnique({ where: { loteId_localId: { loteId, localId } }, select: { quantidade: true } });
  if (!existe && delta >= 0) {
    // primeira entrada neste lote/local; se duas chegarem juntas a segunda cai no conflito e soma
    await tx.$executeRaw`INSERT INTO "Saldo" ("id", "produtoId", "loteId", "localId", "quantidade") VALUES (${crypto.randomUUID()}, ${produtoId}, ${loteId}, ${localId}, ${delta})
      ON CONFLICT ("loteId", "localId") DO UPDATE SET "quantidade" = "Saldo"."quantidade" + ${delta}`;
    return;
  }
  const lote = await tx.lote.findUnique({ where: { id: loteId }, include: { produto: true } });
  throw new EstoqueError(`Saldo insuficiente do lote ${lote?.numero ?? loteId} (${lote?.produto.descricao ?? ""}). Disponível: ${existe?.quantidade ?? 0}.`);
}

export async function movimentar(tx: Tx, m: MovimentoInput) {
  if (!Number.isInteger(m.quantidade) || m.quantidade <= 0) {
    throw new EstoqueError("Quantidade deve ser um inteiro positivo.");
  }
  if (!m.origemId && !m.destinoId) throw new EstoqueError("Movimento sem origem nem destino.");
  if (m.origemId) await ajustarSaldo(tx, m.produtoId, m.loteId, m.origemId, -m.quantidade);
  if (m.destinoId) await ajustarSaldo(tx, m.produtoId, m.loteId, m.destinoId, m.quantidade);
  return tx.movimento.create({
    data: {
      tipo: m.tipo,
      produtoId: m.produtoId,
      loteId: m.loteId,
      origemId: m.origemId ?? null,
      destinoId: m.destinoId ?? null,
      quantidade: m.quantidade,
      custoUnit: m.custoUnit ?? 0,
      documento: m.documento,
      observacao: m.observacao,
      usuario: m.usuario,
    },
  });
}

/**
 * Marca no início da observação do AJUSTE de saída que o inventário de consignado grava quando a falta será cobrada do
 * hospital. O DRE (financeiro/_lib/dre-dados.ts) não conta esse movimento como perda: o hospital responde pelo valor.
 * A conta a receber NÃO é gerada automaticamente (depende de NF/negociação): o valor fica em InventarioConsignacaoItem.valorCobrar.
 */
export const MARCA_COBRAR_HOSPITAL = "COBRAR_HOSPITAL";

/** Locais fixos criados pelo seed. */
export const LOCAIS = {
  DEPOSITO: "local-deposito",
  QUARENTENA: "local-quarentena",
  NAO_CONFORME: "local-nao-conforme",
} as const;

/** Garante que o hospital tenha um local de estoque consignado e devolve o id. */
export async function localDoHospital(tx: Tx, hospitalId: string) {
  const existente = await tx.localEstoque.findUnique({ where: { hospitalId } });
  if (existente) return existente.id;
  const hospital = await tx.hospital.findUniqueOrThrow({ where: { id: hospitalId } });
  const criado = await tx.localEstoque.create({
    data: { nome: `Consignado — ${hospital.nomeFantasia ?? hospital.razaoSocial}`, tipo: "HOSPITAL", hospitalId },
  });
  return criado.id;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Custo médio ponderado do produto após uma entrada (chamar ANTES de `movimentar` a entrada: usa o saldo anterior,
 * somado em todos os locais). Trava a linha do produto até o fim da transação, senão duas entradas simultâneas do
 * mesmo produto (em pedidos diferentes) leem o mesmo custo e uma atualização se perde. Usa FOR NO KEY UPDATE (e não
 * FOR UPDATE): conflita com outra atualização do custo, mas não com o FOR KEY SHARE que a chave estrangeira de Lote/Saldo
 * já tomou nesta transação; com FOR UPDATE dois recebimentos entravam em deadlock.
 * Ordem de travas: quem também trava o pedido de compra trava o PEDIDO antes do produto (evita deadlock).
 * `valorEntrada` é o valor exato da entrega em reais. Devolve o novo custo médio.
 */
export async function atualizarCustoMedio(tx: Tx, produtoId: string, quantidadeEntrada: number, valorEntrada: number) {
  if (!Number.isInteger(quantidadeEntrada) || quantidadeEntrada <= 0) throw new EstoqueError("Quantidade deve ser um inteiro positivo.");
  await tx.$queryRaw`SELECT id FROM "Produto" WHERE id = ${produtoId} FOR NO KEY UPDATE`;
  const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId }, select: { custoMedio: true } });
  const agg = await tx.saldo.aggregate({ where: { produtoId }, _sum: { quantidade: true } });
  const saldoAtual = Math.max(0, agg._sum.quantidade ?? 0);
  const novoCusto = round2((saldoAtual * Number(produto.custoMedio.toString()) + valorEntrada) / (saldoAtual + quantidadeEntrada));
  await tx.produto.update({ where: { id: produtoId }, data: { custoMedio: novoCusto } });
  return novoCusto;
}

/**
 * Remove o local consignado de um hospital que vai ser excluído. Só se o local nunca teve movimentação
 * (saldo, kardex ou remessa): devolve `false`, sem apagar, caso contrário.
 */
export async function removerLocalDoHospital(tx: Tx, localId: string): Promise<boolean> {
  const c = await tx.localEstoque.findUnique({
    where: { id: localId },
    select: { _count: { select: { saldos: true, movOrigem: true, movDestino: true, remessas: true } } },
  });
  if (!c) return true;
  if (c._count.saldos + c._count.movOrigem + c._count.movDestino + c._count.remessas > 0) return false;
  await tx.localEstoque.delete({ where: { id: localId } });
  return true;
}

/** Soma por produto de CONSUMO menos os estornos de consumo (RETORNO sem origem, documento CIR-n, observação "estorno"). */
export function descontarEstornos(consumo: Map<string, number>, estornos: Map<string, number>): Map<string, number> {
  const r = new Map<string, number>();
  for (const [id, q] of consumo) r.set(id, Math.max(0, q - (estornos.get(id) ?? 0)));
  return r;
}

/**
 * Consumo líquido por produto no período: CONSUMO menos o RETORNO gravado pelo estorno de consumo da cirurgia
 * (comercial/_lib/consumo-servico.ts: tipo RETORNO, origemId nulo, documento CIR-n, observacao "estorno").
 * Sem isso, estornar um consumo lançado por engano continuaria contando como saída.
 */
export async function consumoLiquidoPorProduto(periodo: { desde?: Date; ate?: Date }): Promise<Map<string, number>> {
  const criadoEm = { ...(periodo.desde ? { gte: periodo.desde } : {}), ...(periodo.ate ? { lte: periodo.ate } : {}) };
  const [consumo, estornos] = await Promise.all([
    db.movimento.groupBy({ by: ["produtoId"], where: { tipo: "CONSUMO", criadoEm }, _sum: { quantidade: true } }),
    db.movimento.groupBy({
      by: ["produtoId"],
      where: { tipo: "RETORNO", origemId: null, observacao: "estorno", documento: { startsWith: "CIR-" }, criadoEm },
      _sum: { quantidade: true },
    }),
  ]);
  const mapa = (rows: { produtoId: string; _sum: { quantidade: number | null } }[]) => new Map(rows.map((r) => [r.produtoId, r._sum.quantidade ?? 0]));
  return descontarEstornos(mapa(consumo), mapa(estornos));
}
