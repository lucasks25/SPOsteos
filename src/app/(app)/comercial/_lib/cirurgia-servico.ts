import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { travarCirurgia } from "./trava-cirurgia";
import { CTX_CARTEIRINHA, cifrar, indiceBusca } from "@/lib/cripto";

/** Carteirinha cifrada + índice cego; vazio vira nulo nos dois. */
export function carteirinhaParaGravar(valor: string | null | undefined) {
  const v = valor?.trim();
  return v ? { carteirinha: cifrar(v, CTX_CARTEIRINHA), carteirinhaHash: indiceBusca(v, CTX_CARTEIRINHA) } : { carteirinha: null, carteirinhaHash: null };
}

/** Troca de hospital recusada: a action converte em erro no campo `hospitalId`. */
export class HospitalTravadoError extends ErroNegocio {}

export type DadosCirurgia = {
  dataHora: Date;
  hospitalId: string;
  medicoId: string;
  convenioId?: string | null;
  procedimentoId?: string | null;
  representanteId?: string | null;
  paciente: string;
  carteirinha?: string | null;
  sus: boolean;
  observacao?: string | null;
};

/**
 * Cria (sem `id`) ou edita a cirurgia. Edição recusa FATURADA/CANCELADA e a troca de hospital quando já há
 * consumo ou remessa (o estoque consignado está no local do hospital original).
 */
export async function salvarCirurgiaTx(tx: Tx, id: string | null, dados: DadosCirurgia) {
  const data = { ...dados, ...carteirinhaParaGravar(dados.carteirinha) };
  if (!id) return { cirurgia: await tx.cirurgia.create({ data }), criada: true };
  await travarCirurgia(tx, id);
  const atual = await tx.cirurgia.findUnique({ where: { id }, include: { _count: { select: { consumos: true, remessas: true } } } });
  if (!atual) throw new ErroNegocio("Cirurgia não encontrada.");
  if (atual.status === "FATURADA" || atual.status === "CANCELADA") throw new ErroNegocio(`Cirurgia ${atual.status.toLowerCase()} não pode ser editada.`);
  if (atual.hospitalId !== data.hospitalId && (atual._count.consumos > 0 || atual._count.remessas > 0)) {
    throw new HospitalTravadoError("Não é possível trocar o hospital: há remessas ou consumo vinculados.");
  }
  return { cirurgia: await tx.cirurgia.update({ where: { id }, data }), criada: false };
}

/** AGENDADA → CONFIRMADA. */
export async function confirmarCirurgiaTx(tx: Tx, id: string) {
  await travarCirurgia(tx, id);
  const c = await tx.cirurgia.findUnique({ where: { id } });
  if (!c) throw new ErroNegocio("Cirurgia não encontrada.");
  if (c.status !== "AGENDADA") throw new ErroNegocio("Apenas cirurgias agendadas podem ser confirmadas.");
  await tx.cirurgia.update({ where: { id }, data: { status: "CONFIRMADA" } });
  return c;
}

/** Cancela se não estiver FATURADA/CANCELADA, sem consumo e sem pedido de venda ativo. */
export async function cancelarCirurgiaTx(tx: Tx, id: string) {
  await travarCirurgia(tx, id);
  const c = await tx.cirurgia.findUnique({ where: { id }, include: { _count: { select: { consumos: true } }, pedido: true } });
  if (!c) throw new ErroNegocio("Cirurgia não encontrada.");
  if (c.status === "FATURADA" || c.status === "CANCELADA") throw new ErroNegocio(`Cirurgia já está ${c.status.toLowerCase()}.`);
  if (c._count.consumos > 0) throw new ErroNegocio("Há consumo registrado. Remova o consumo antes de cancelar.");
  if (c.pedido && c.pedido.status !== "CANCELADO") throw new ErroNegocio("Há pedido de venda vinculado.");
  await tx.cirurgia.update({ where: { id }, data: { status: "CANCELADA" } });
  return c;
}
