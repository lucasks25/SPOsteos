import "server-only";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { statusEfetivo, verificarRiscoGlosa, type ResultadoRisco, type StatusAutorizacao } from "./autorizacao";

export class AutorizacaoError extends ErroNegocio {}

export type ItemAutorizacaoInput = { produtoId: string; quantidadeSolicitada: number; quantidadeAutorizada: number; valorAutorizado?: number | null };
export type AutorizacaoInput = {
  cirurgiaId: string;
  numeroGuia?: string | null;
  senha?: string | null;
  status: StatusAutorizacao;
  solicitadaEm: Date;
  autorizadaEm?: Date | null;
  validade?: Date | null;
  observacao?: string | null;
  itens: ItemAutorizacaoInput[];
};

const STATUS_COM_AUTORIZACAO: StatusAutorizacao[] = ["AUTORIZADA", "PARCIAL"];

/**
 * Cria (ou, com `id`, substitui) a autorização de uma cirurgia, com os itens. Rejeita cirurgia cancelada,
 * produto repetido, quantidades inválidas e validade anterior à solicitação. Em SOLICITADA/NEGADA a quantidade
 * autorizada é zerada (nada foi autorizado). AUTORIZADA/PARCIAL exigem ao menos um item autorizado.
 */
export async function salvarAutorizacaoTx(tx: Tx, input: AutorizacaoInput, id?: string) {
  const cirurgia = await tx.cirurgia.findUnique({ where: { id: input.cirurgiaId }, select: { status: true, numero: true } });
  if (!cirurgia) throw new AutorizacaoError("Cirurgia não encontrada.");
  if (cirurgia.status === "CANCELADA") throw new AutorizacaoError("Cirurgia cancelada: não é possível registrar autorização.");
  if (id) {
    const atual = await tx.autorizacaoConvenio.findUnique({ where: { id }, select: { cirurgiaId: true } });
    if (!atual || atual.cirurgiaId !== input.cirurgiaId) throw new AutorizacaoError("Autorização não encontrada.");
  }
  if (input.validade && input.validade.getTime() < input.solicitadaEm.getTime()) throw new AutorizacaoError("A validade não pode ser anterior à data da solicitação.");

  const vistos = new Set<string>();
  for (const i of input.itens) {
    if (!Number.isInteger(i.quantidadeSolicitada) || i.quantidadeSolicitada <= 0) throw new AutorizacaoError("A quantidade solicitada de cada item deve ser um inteiro maior que zero.");
    if (!Number.isInteger(i.quantidadeAutorizada) || i.quantidadeAutorizada < 0) throw new AutorizacaoError("A quantidade autorizada deve ser um inteiro igual ou maior que zero.");
    if (i.valorAutorizado != null && (!Number.isFinite(i.valorAutorizado) || i.valorAutorizado < 0)) throw new AutorizacaoError("O valor autorizado não pode ser negativo.");
    if (vistos.has(i.produtoId)) throw new AutorizacaoError("O mesmo produto aparece mais de uma vez na guia. Junte as quantidades em uma linha.");
    vistos.add(i.produtoId);
  }
  const comAutorizacao = STATUS_COM_AUTORIZACAO.includes(input.status);
  const itens = input.itens.map((i) => (input.status === "SOLICITADA" || input.status === "NEGADA" ? { ...i, quantidadeAutorizada: 0, valorAutorizado: null } : i));
  if (comAutorizacao && !itens.some((i) => i.quantidadeAutorizada > 0)) throw new AutorizacaoError("Autorizada ou parcial: informe a quantidade autorizada de ao menos um item.");
  if (comAutorizacao && !input.autorizadaEm) throw new AutorizacaoError("Informe a data em que o convênio autorizou.");

  const dados = {
    numeroGuia: input.numeroGuia?.trim() || null,
    senha: input.senha?.trim() || null,
    status: input.status,
    solicitadaEm: input.solicitadaEm,
    autorizadaEm: comAutorizacao ? (input.autorizadaEm ?? null) : null,
    validade: input.validade ?? null,
    observacao: input.observacao?.trim() || null,
  };
  const itensData = itens.map((i) => ({ produtoId: i.produtoId, quantidadeSolicitada: i.quantidadeSolicitada, quantidadeAutorizada: i.quantidadeAutorizada, valorAutorizado: i.valorAutorizado ?? null }));
  if (id) {
    await tx.autorizacaoItem.deleteMany({ where: { autorizacaoId: id } });
    return tx.autorizacaoConvenio.update({ where: { id }, data: { ...dados, itens: { create: itensData } } });
  }
  return tx.autorizacaoConvenio.create({ data: { cirurgiaId: input.cirurgiaId, ...dados, itens: { create: itensData } } });
}

export async function excluirAutorizacaoTx(tx: Tx, id: string) {
  const a = await tx.autorizacaoConvenio.findUnique({ where: { id }, select: { cirurgiaId: true } });
  if (!a) throw new AutorizacaoError("Autorização não encontrada.");
  await tx.autorizacaoConvenio.delete({ where: { id } });
  return a.cirurgiaId;
}

/** Itens sugeridos para uma nova guia: materiais do procedimento e, se não houver, o que já foi consumido. */
export async function sugerirItensGuia(cirurgiaId: string) {
  const c = await db.cirurgia.findUnique({
    where: { id: cirurgiaId },
    select: { procedimento: { select: { itens: { select: { produtoId: true, quantidade: true } } } }, consumos: { select: { produtoId: true, quantidade: true } } },
  });
  if (!c) return [];
  const mapa = new Map<string, number>();
  for (const i of c.procedimento?.itens ?? []) mapa.set(i.produtoId, (mapa.get(i.produtoId) ?? 0) + i.quantidade);
  for (const k of c.consumos) if (!mapa.has(k.produtoId)) mapa.set(k.produtoId, k.quantidade);
  return [...mapa].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

/** Lê a cirurgia, o convênio, as guias e o consumo e devolve os achados de risco de glosa. */
export async function riscoGlosaDaCirurgia(cirurgiaId: string, cliente: Pick<Tx, "cirurgia"> = db): Promise<ResultadoRisco> {
  const c = await cliente.cirurgia.findUnique({
    where: { id: cirurgiaId },
    select: {
      dataHora: true,
      status: true,
      convenio: { select: { exigeAutorizacao: true } },
      consumos: { select: { produtoId: true, quantidade: true, produto: { select: { codigo: true, descricao: true } } } },
      autorizacoes: { select: { status: true, validade: true, itens: { select: { produtoId: true, quantidadeAutorizada: true, produto: { select: { codigo: true, descricao: true } } } } } },
    },
  });
  if (!c) return { aplicavel: false, achados: [], grave: false };
  const nomes: Record<string, string> = {};
  for (const a of c.autorizacoes) for (const i of a.itens) nomes[i.produtoId] = `${i.produto.codigo} — ${i.produto.descricao}`;
  return verificarRiscoGlosa({
    aplicavel: c.status !== "CANCELADA" && !!c.convenio && c.convenio.exigeAutorizacao,
    dataCirurgia: c.dataHora,
    autorizacoes: c.autorizacoes.map((a) => ({ status: a.status, validade: a.validade, itens: a.itens.map((i) => ({ produtoId: i.produtoId, quantidadeAutorizada: i.quantidadeAutorizada })) })),
    consumos: c.consumos.map((k) => ({ produtoId: k.produtoId, descricao: `${k.produto.codigo} — ${k.produto.descricao}`, quantidade: k.quantidade })),
    nomes,
  });
}

/**
 * Cirurgias que acontecem nos próximos `dias` dias (de `agora`) sem nenhuma autorização AUTORIZADA/PARCIAL ainda válida
 * na data da cirurgia, em convênio que exige autorização. Alimenta o sino de pendências do COMERCIAL.
 */
export async function contarCirurgiasSemAutorizacao(agora: Date, dias = 7): Promise<number> {
  const ate = new Date(agora.getTime() + dias * 86_400_000);
  const rows = await db.cirurgia.findMany({
    where: { status: { in: ["AGENDADA", "CONFIRMADA"] }, dataHora: { gte: agora, lt: ate }, convenio: { is: { exigeAutorizacao: true } } },
    select: { dataHora: true, autorizacoes: { select: { status: true, validade: true } } },
  });
  return rows.filter((r) => !r.autorizacoes.some((a) => ["AUTORIZADA", "PARCIAL"].includes(statusEfetivo(a, r.dataHora)))).length;
}
