import type { Tx } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { inicioDoDiaUTC, type LinhaRemessa, type LoteDisp } from "./fefo";
import { ErroNegocio } from "@/lib/erros";
import { registrarConsumoCirurgiaTx, type ItemConsumo } from "@/app/(app)/comercial/_lib/publico";

/**
 * Regras de negócio de remessas (vales de consignação).
 * Todas as funções recebem `tx` e devem rodar dentro de `db.$transaction`.
 */
export class RemessaError extends ErroNegocio {}

export const docRemessa = (id: number) => `REM-${id}`;
export const docCirurgia = (numero: number) => `CIR-${numero}`;

/**
 * Lotes disponíveis para remessa: LIBERADO, não vencidos, com saldo no DEPÓSITO,
 * descontando o que já está reservado em remessas ABERTAS. Ordenados por FEFO.
 */
export async function lotesDisponiveis(
  tx: Tx,
  opts: { produtoIds?: string[]; ignorarRemessaId?: number } = {},
): Promise<LoteDisp[]> {
  const saldos = await tx.saldo.findMany({
    where: {
      localId: LOCAIS.DEPOSITO,
      quantidade: { gt: 0 },
      lote: { status: "LIBERADO", validade: { gte: inicioDoDiaUTC() } },
      ...(opts.produtoIds ? { produtoId: { in: opts.produtoIds } } : {}),
    },
    include: { lote: { select: { numero: true, validade: true } } },
    orderBy: [{ lote: { validade: "asc" } }, { lote: { numero: "asc" } }],
  });
  if (saldos.length === 0) return [];
  const reservas = await tx.remessaItem.groupBy({
    by: ["loteId"],
    where: {
      loteId: { in: saldos.map((s) => s.loteId) },
      remessa: { status: "ABERTA", ...(opts.ignorarRemessaId ? { id: { not: opts.ignorarRemessaId } } : {}) },
    },
    _sum: { quantidade: true },
  });
  const reservado = new Map(reservas.map((r) => [r.loteId, r._sum.quantidade ?? 0]));
  return saldos
    .map((s) => ({
      loteId: s.loteId,
      produtoId: s.produtoId,
      numero: s.lote.numero,
      validade: s.lote.validade.toISOString(),
      disponivel: s.quantidade - (reservado.get(s.loteId) ?? 0),
    }))
    .filter((l) => l.disponivel > 0);
}

export type NovaRemessa = {
  hospitalId: string;
  cirurgiaId?: string | null;
  kitId?: string | null;
  observacao?: string | null;
  itens: LinhaRemessa[];
};

/** Cria a remessa em status ABERTA (sem movimentar estoque). */
export async function criarRemessa(tx: Tx, input: NovaRemessa) {
  if (input.itens.length === 0) throw new RemessaError("Informe ao menos um item.");
  const hospital = await tx.hospital.findUnique({ where: { id: input.hospitalId } });
  if (!hospital) throw new RemessaError("Hospital não encontrado.");

  if (input.cirurgiaId) {
    const cir = await tx.cirurgia.findUnique({ where: { id: input.cirurgiaId } });
    if (!cir) throw new RemessaError("Cirurgia não encontrada.");
    if (cir.hospitalId !== input.hospitalId) throw new RemessaError("A cirurgia é de outro hospital.");
    if (cir.status === "CANCELADA" || cir.status === "FATURADA") {
      throw new RemessaError(`Cirurgia nº ${cir.numero} está ${cir.status.toLowerCase()}.`);
    }
  }
  if (input.kitId && !(await tx.kit.findUnique({ where: { id: input.kitId } }))) {
    throw new RemessaError("Kit não encontrado.");
  }

  // Consolida linhas do mesmo lote
  const porLote = new Map<string, LinhaRemessa>();
  for (const it of input.itens) {
    if (!Number.isInteger(it.quantidade) || it.quantidade <= 0) throw new RemessaError("Quantidades devem ser inteiros positivos.");
    const atual = porLote.get(it.loteId);
    if (atual && atual.produtoId !== it.produtoId) throw new RemessaError("Lote informado para produtos diferentes.");
    porLote.set(it.loteId, { ...it, quantidade: (atual?.quantidade ?? 0) + it.quantidade });
  }

  const disp = new Map(
    (await lotesDisponiveis(tx, { produtoIds: [...new Set(input.itens.map((i) => i.produtoId))] })).map((l) => [l.loteId, l]),
  );
  for (const it of porLote.values()) {
    const lote = await tx.lote.findUnique({ where: { id: it.loteId }, include: { produto: true } });
    if (!lote || lote.produtoId !== it.produtoId) throw new RemessaError("Lote não pertence ao produto informado.");
    validarLoteParaEnvio(lote);
    const livre = disp.get(it.loteId)?.disponivel ?? 0;
    if (it.quantidade > livre) {
      throw new RemessaError(
        `Lote ${lote.numero} (${lote.produto.descricao}): disponível no depósito ${livre}, solicitado ${it.quantidade}.`,
      );
    }
  }

  const localId = await localDoHospital(tx, input.hospitalId);
  return tx.remessa.create({
    data: {
      localId,
      cirurgiaId: input.cirurgiaId || null,
      kitId: input.kitId || null,
      observacao: input.observacao || null,
      itens: { create: [...porLote.values()].map((i) => ({ produtoId: i.produtoId, loteId: i.loteId, quantidade: i.quantidade })) },
    },
  });
}

function validarLoteParaEnvio(lote: { numero: string; status: string; validade: Date; produto: { descricao: string } }) {
  if (lote.status !== "LIBERADO") {
    throw new RemessaError(`Lote ${lote.numero} (${lote.produto.descricao}) não está liberado (${lote.status.toLowerCase()}).`);
  }
  if (lote.validade < inicioDoDiaUTC()) {
    throw new RemessaError(`Lote ${lote.numero} (${lote.produto.descricao}) está vencido.`);
  }
}

/** Troca o status de forma atômica (protege contra duplo envio/concorrência). */
async function trocarStatus(tx: Tx, id: number, de: "ABERTA" | "ENVIADA", data: Parameters<Tx["remessa"]["updateMany"]>[0]["data"]) {
  const r = await tx.remessa.updateMany({ where: { id, status: de }, data });
  if (r.count !== 1) throw new RemessaError(`A remessa ${docRemessa(id)} não está ${de.toLowerCase()}.`);
}

/** ABERTA → ENVIADA: movimenta DEPÓSITO → local do hospital para cada item. */
export async function enviarRemessa(tx: Tx, id: number, usuario: string) {
  await trocarStatus(tx, id, "ABERTA", { status: "ENVIADA", enviadaEm: new Date() });
  const remessa = await tx.remessa.findUniqueOrThrow({
    where: { id },
    include: { itens: { include: { lote: { include: { produto: true } } } } },
  });
  if (remessa.itens.length === 0) throw new RemessaError("Remessa sem itens.");
  for (const item of remessa.itens) {
    validarLoteParaEnvio(item.lote);
    await movimentar(tx, {
      tipo: "REMESSA",
      produtoId: item.produtoId,
      loteId: item.loteId,
      quantidade: item.quantidade,
      origemId: LOCAIS.DEPOSITO,
      destinoId: remessa.localId,
      custoUnit: toNumber(item.lote.produto.custoMedio),
      documento: docRemessa(id),
      usuario,
    });
  }
  return remessa;
}

export type RetornoItem = { itemId: string; devolvido: number; consumido: number };

/**
 * ENVIADA → CONFERIDA: devolvido volta ao DEPÓSITO (RETORNO), consumido sai do hospital (CONSUMO).
 * O restante permanece consignado no hospital. Se houver cirurgia vinculada, gera CirurgiaConsumo
 * e marca a cirurgia como REALIZADA via API pública do comercial (só quando há consumo).
 */
export async function conferirRemessa(tx: Tx, id: number, retornos: RetornoItem[], usuario: string) {
  await trocarStatus(tx, id, "ENVIADA", { status: "CONFERIDA", conferidaEm: new Date() });
  const remessa = await tx.remessa.findUniqueOrThrow({
    where: { id },
    include: { cirurgia: true, itens: { include: { produto: true } } },
  });
  const porItem = new Map(retornos.map((r) => [r.itemId, r]));
  const documento = remessa.cirurgia ? docCirurgia(remessa.cirurgia.numero) : docRemessa(id);
  const observacaoConsumo = remessa.cirurgia ? `Remessa ${docRemessa(id)}` : undefined;

  const consumos: ItemConsumo[] = [];
  for (const item of remessa.itens) {
    const r = porItem.get(item.id) ?? { itemId: item.id, devolvido: 0, consumido: 0 };
    const { devolvido, consumido } = r;
    if (![devolvido, consumido].every((n) => Number.isInteger(n) && n >= 0)) {
      throw new RemessaError(`Quantidades inválidas para ${item.produto.descricao}.`);
    }
    if (devolvido + consumido > item.quantidade) {
      throw new RemessaError(
        `${item.produto.descricao}: devolvido + consumido (${devolvido + consumido}) excede o enviado (${item.quantidade}).`,
      );
    }
    const custoUnit = toNumber(item.produto.custoMedio);
    if (devolvido > 0) {
      await movimentar(tx, {
        tipo: "RETORNO",
        produtoId: item.produtoId,
        loteId: item.loteId,
        quantidade: devolvido,
        origemId: remessa.localId,
        destinoId: LOCAIS.DEPOSITO,
        custoUnit,
        documento: docRemessa(id),
        usuario,
      });
    }
    if (consumido > 0) {
      await movimentar(tx, {
        tipo: "CONSUMO",
        produtoId: item.produtoId,
        loteId: item.loteId,
        quantidade: consumido,
        origemId: remessa.localId,
        destinoId: null,
        custoUnit,
        documento,
        observacao: observacaoConsumo,
        usuario,
      });
      consumos.push({ produtoId: item.produtoId, loteId: item.loteId, quantidade: consumido });
    }
    await tx.remessaItem.update({ where: { id: item.id }, data: { devolvido, consumido } });
  }

  // Regra única de status do comercial (aceita AGENDADA/CONFIRMADA/REALIZADA; recusa FATURADA/CANCELADA).
  if (remessa.cirurgiaId && consumos.length > 0) await registrarConsumoCirurgiaTx(tx, remessa.cirurgiaId, consumos);
  return remessa;
}

/** Cancela uma remessa ABERTA (nenhum estoque foi movimentado ainda). */
export async function cancelarRemessa(tx: Tx, id: number) {
  await trocarStatus(tx, id, "ABERTA", { status: "CANCELADA" });
}
