import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { LOCAIS, localDoHospital, movimentar } from "@/lib/estoque";
import { toNumber } from "@/lib/format";
import { inicioDoDiaUTC, type LinhaRemessa, type LoteDisp } from "./fefo";
import { ErroNegocio } from "@/lib/erros";
import { registrarConsumoCirurgiaTx, travarCirurgia, type ItemConsumo } from "@/app/(app)/comercial/_lib/publico";

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

  // Reserva FEFO: trava os produtos (em ordem de id, sem deadlock entre vales) antes de ler o disponível. Dois vales
  // simultâneos do mesmo produto serializam aqui e o segundo já desconta a reserva do primeiro (antes a falha só aparecia
  // no envio). FOR NO KEY UPDATE, como em atualizarCustoMedio: não conflita com o FOR KEY SHARE das chaves estrangeiras.
  const produtoIds = [...new Set(input.itens.map((i) => i.produtoId))].sort();
  await tx.$queryRaw`SELECT id FROM "Produto" WHERE id IN (${Prisma.join(produtoIds)}) ORDER BY id FOR NO KEY UPDATE`;
  const disp = new Map((await lotesDisponiveis(tx, { produtoIds })).map((l) => [l.loteId, l]));
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

/**
 * Recusa movimentar o consignado de um hospital com inventário em andamento (ABERTO ou CONTADO): o fechamento compara a
 * contagem com o saldo atual, então um vale enviado ou conferido no meio geraria falta ou sobra falsa (REVISAO §22).
 * Trava o local FOR SHARE: a criação do inventário trava o mesmo local FOR UPDATE, então as duas serializam (o vale espera
 * a foto do inventário e a vê; o inventário espera o vale terminar e fotografa o saldo já movimentado).
 */
async function exigirSemInventario(tx: Tx, localId: string) {
  await tx.$queryRaw`SELECT id FROM "LocalEstoque" WHERE id = ${localId} FOR SHARE`;
  const inv = await tx.inventarioConsignacao.findFirst({ where: { localId, status: { in: ["ABERTO", "CONTADO"] } }, select: { id: true } });
  if (inv) throw new RemessaError(`Há inventário em andamento neste hospital (INV-${inv.id}); feche-o ou cancele antes de movimentar consignado.`);
}

/** Troca o status de forma atômica (protege contra duplo envio/concorrência). */
async function trocarStatus(tx: Tx, id: number, de: "ABERTA" | "ENVIADA", data: Parameters<Tx["remessa"]["updateMany"]>[0]["data"]) {
  const r = await tx.remessa.updateMany({ where: { id, status: de }, data });
  if (r.count !== 1) throw new RemessaError(`A remessa ${docRemessa(id)} não está ${de.toLowerCase()}.`);
}

/** ABERTA → ENVIADA: movimenta DEPÓSITO → local do hospital para cada item. */
export async function enviarRemessa(tx: Tx, id: number, usuario: string) {
  await trocarStatus(tx, id, "ABERTA", { status: "ENVIADA", enviadaEm: new Date() });
  // Trava os lotes FOR SHARE antes de ler o status: um recolhimento (FOR UPDATE nos lotes) aberto ao mesmo tempo espera o
  // envio terminar e fotografa o saldo já no hospital, ou bloqueia antes e o envio vê BLOQUEADO. Ordem Lote → Saldo.
  const loteIds = [...new Set((await tx.remessaItem.findMany({ where: { remessaId: id }, select: { loteId: true } })).map((i) => i.loteId))];
  await tx.$queryRaw`SELECT id FROM "Lote" WHERE id = ANY(${loteIds}::text[]) ORDER BY id FOR SHARE`;
  const remessa = await tx.remessa.findUniqueOrThrow({
    where: { id },
    include: { cirurgia: { select: { numero: true, status: true } }, itens: { include: { lote: { include: { produto: true } } } } },
  });
  if (remessa.itens.length === 0) throw new RemessaError("Remessa sem itens.");
  await exigirSemInventario(tx, remessa.localId);
  // mesma regra da criação: material não sai para cirurgia cancelada (não vai acontecer) nem faturada (consumo já fechado)
  if (remessa.cirurgia && (remessa.cirurgia.status === "CANCELADA" || remessa.cirurgia.status === "FATURADA")) {
    throw new RemessaError(`Cirurgia nº ${remessa.cirurgia.numero} está ${remessa.cirurgia.status.toLowerCase()}: cancele este vale em vez de enviá-lo.`);
  }
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
  // Trava a cirurgia ANTES de qualquer movimentar: o consumo direto e o estorno travam Cirurgia → Saldo; travar o saldo
  // aqui e só depois a cirurgia (em registrarConsumoCirurgiaTx) dava deadlock entre os dois.
  const ref = await tx.remessa.findUnique({ where: { id }, select: { cirurgiaId: true } });
  if (ref?.cirurgiaId) await travarCirurgia(tx, ref.cirurgiaId);
  await trocarStatus(tx, id, "ENVIADA", { status: "CONFERIDA", conferidaEm: new Date() });
  const remessa = await tx.remessa.findUniqueOrThrow({
    where: { id },
    include: { cirurgia: true, itens: { include: { produto: true } } },
  });
  if (remessa.cirurgiaId && remessa.cirurgiaId !== ref?.cirurgiaId) await travarCirurgia(tx, remessa.cirurgiaId); // vínculo trocado no meio
  await exigirSemInventario(tx, remessa.localId);
  const porItem = new Map(retornos.map((r) => [r.itemId, r]));
  // Vale de cirurgia conferido com tudo zero fecha o vale sem consumo nem devolução e não tem volta (a tela vem com 0
  // preenchido: um clique em "Concluir" bastava). Sem cirurgia (material que fica consignado no hospital), zero vale.
  const informado = remessa.itens.reduce((s, it) => s + (porItem.get(it.id)?.devolvido ?? 0) + (porItem.get(it.id)?.consumido ?? 0), 0);
  if (informado === 0 && remessa.cirurgia && remessa.cirurgia.status !== "CANCELADA") {
    throw new RemessaError(
      `Nenhuma quantidade informada para a cirurgia ${docCirurgia(remessa.cirurgia.numero)}. Informe o consumido e o devolvido de cada item; ` +
        "se o material ainda não voltou do hospital, deixe o vale como enviado e confira quando o retorno chegar.",
    );
  }
  const documento = remessa.cirurgia ? docCirurgia(remessa.cirurgia.numero) : docRemessa(id);
  const observacaoConsumo = remessa.cirurgia ? `Remessa ${docRemessa(id)}` : undefined;

  const consumos: ItemConsumo[] = [];
  for (const item of remessa.itens) {
    const r = porItem.get(item.id) ?? { itemId: item.id, devolvido: 0, consumido: 0 };
    const { devolvido, consumido } = r;
    if (![devolvido, consumido].every((n) => Number.isInteger(n) && n >= 0)) {
      throw new RemessaError(`Quantidades inválidas para ${item.produto.descricao}.`);
    }
    if (consumido > 0 && !remessa.cirurgiaId) {
      throw new RemessaError(
        `${item.produto.descricao}: vale sem cirurgia não registra consumido (nunca seria faturado). Registre o consumo direto na cirurgia.`,
      );
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

