import "server-only";
import type { TipoMovimento } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
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
