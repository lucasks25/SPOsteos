import "server-only";
import { db } from "@/lib/db";

const MAX_LOTES = 30;

/** Busca lotes por número de lote, série, GTIN ou código do produto. */
export async function buscarLotes(q: string) {
  const termo = q.trim();
  if (!termo) return { lotes: [], truncado: false };
  const lotes = await db.lote.findMany({
    where: {
      OR: [
        { numero: { equals: termo, mode: "insensitive" } },
        { serie: { equals: termo, mode: "insensitive" } },
        { produto: { gtin: termo } },
        { produto: { codigo: { equals: termo, mode: "insensitive" } } },
      ],
    },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
    take: MAX_LOTES + 1,
  });
  let ids = lotes.map((l) => l.id);
  // Sem correspondência exata: tenta busca parcial pelo número do lote/série
  if (ids.length === 0) {
    const parciais = await db.lote.findMany({
      where: { OR: [{ numero: { contains: termo, mode: "insensitive" } }, { serie: { contains: termo, mode: "insensitive" } }] },
      select: { id: true },
      take: MAX_LOTES + 1,
    });
    ids = parciais.map((l) => l.id);
  }
  const truncado = ids.length > MAX_LOTES;
  return { lotes: await Promise.all(ids.slice(0, MAX_LOTES).map(rastrearLote)), truncado };
}

export async function rastrearLote(loteId: string) {
  const lote = await db.lote.findUniqueOrThrow({
    where: { id: loteId },
    include: {
      produto: { include: { fabricante: true } },
      saldos: { where: { quantidade: { not: 0 } }, include: { local: true } },
      inspecoes: { orderBy: { criadoEm: "asc" } },
      movimentos: {
        orderBy: { criadoEm: "asc" },
        include: { origem: { select: { nome: true } }, destino: { select: { nome: true } } },
      },
      remessaItens: {
        include: {
          remessa: {
            include: {
              local: { include: { hospital: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } } } },
              cirurgia: { select: { numero: true, paciente: true } },
            },
          },
        },
        orderBy: { remessaId: "asc" },
      },
      consumos: {
        include: {
          cirurgia: {
            include: {
              hospital: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } },
              medico: { select: { nome: true, crm: true, ufCrm: true } },
              convenio: { select: { nome: true } },
            },
          },
        },
      },
    },
  });

  // Entradas: documento "PC-<id>" aponta para o pedido de compra
  const pedidoIds = [
    ...new Set(
      lote.movimentos
        .filter((m) => m.tipo === "ENTRADA" && m.documento && /^PC-\d+$/.test(m.documento))
        .map((m) => Number(m.documento!.slice(3))),
    ),
  ];
  const pedidos = pedidoIds.length
    ? await db.pedidoCompra.findMany({
        where: { id: { in: pedidoIds } },
        include: { fornecedor: { select: { razaoSocial: true, cnpj: true, afe: true } } },
      })
    : [];

  const entradas = lote.movimentos
    .filter((m) => m.tipo === "ENTRADA")
    .map((m) => ({
      movimento: m,
      pedido: m.documento && /^PC-\d+$/.test(m.documento) ? pedidos.find((p) => p.id === Number(m.documento!.slice(3))) ?? null : null,
    }));

  return { lote, entradas };
}

export type Rastreio = Awaited<ReturnType<typeof rastrearLote>>;
