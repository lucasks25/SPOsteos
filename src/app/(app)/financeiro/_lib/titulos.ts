import "server-only";
import type { FormaPagamento } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { toNumber } from "@/lib/format";
import type { Tipo } from "./config";
import { ErroNegocio } from "@/lib/erros";

/** Regra de negócio violada (mensagem já amigável para o usuário). */
export class FinanceiroError extends ErroNegocio {}

const cent = (n: number) => Math.round(n * 100);
export const arredondar = (n: number) => cent(n) / 100;

type TituloBasico = { id: string; descricao: string; valor: number; status: "ABERTO" | "PAGO" | "CANCELADO" };

async function carregar(tx: Tx, tipo: Tipo, id: string): Promise<TituloBasico> {
  const t =
    tipo === "receber"
      ? await tx.contaReceber.findUnique({ where: { id }, select: { id: true, descricao: true, valor: true, status: true } })
      : await tx.contaPagar.findUnique({ where: { id }, select: { id: true, descricao: true, valor: true, status: true } });
  if (!t) throw new FinanceiroError("Título não encontrado.");
  return { ...t, valor: toNumber(t.valor) };
}

const filtroLancamentos = (tipo: Tipo, id: string) => (tipo === "receber" ? { contaReceberId: id } : { contaPagarId: id });

/**
 * Recalcula valorPago, pagoEm e status do título a partir dos lançamentos (baixas).
 * É o único lugar que escreve esses três campos, para o título nunca divergir do caixa.
 */
export async function recalcularTitulo(tx: Tx, tipo: Tipo, id: string) {
  const titulo = await carregar(tx, tipo, id);
  const soma = await tx.lancamento.aggregate({ where: filtroLancamentos(tipo, id), _sum: { valor: true }, _max: { data: true } });
  const pago = toNumber(soma._sum.valor);
  const data = {
    valorPago: pago > 0 ? pago : null,
    pagoEm: soma._max.data ?? null,
    status: (cent(pago) >= cent(titulo.valor) ? "PAGO" : "ABERTO") as "PAGO" | "ABERTO",
  };
  if (tipo === "receber") await tx.contaReceber.update({ where: { id }, data });
  else await tx.contaPagar.update({ where: { id }, data });
  return { ...data, valorPago: pago };
}

export type BaixaInput = {
  tipo: Tipo;
  tituloId: string;
  contaId: string;
  data: Date;
  valor: number;
  forma?: FormaPagamento | null;
};

/** Registra um pagamento/recebimento (total ou parcial) e atualiza o título. */
export async function registrarBaixa(tx: Tx, input: BaixaInput) {
  const { tipo, tituloId, contaId, data, valor, forma } = input;
  if (!(cent(valor) > 0)) throw new FinanceiroError("Informe um valor maior que zero.");
  const titulo = await carregar(tx, tipo, tituloId);
  if (titulo.status !== "ABERTO") throw new FinanceiroError("O título não está em aberto.");
  const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
  if (!conta) throw new FinanceiroError("Conta bancária não encontrada.");
  if (!conta.ativo) throw new FinanceiroError("A conta bancária está inativa.");

  const lancamento = await tx.lancamento.create({
    data: {
      contaId,
      data,
      valor,
      forma: forma ?? null,
      descricao: titulo.descricao,
      sentido: tipo === "receber" ? "ENTRADA" : "SAIDA",
      ...(tipo === "receber" ? { contaReceberId: tituloId } : { contaPagarId: tituloId }),
    },
  });
  await recalcularTitulo(tx, tipo, tituloId);
  return lancamento;
}

/** Estorna uma baixa (apaga o lançamento) e reabre o título se ele deixar de estar quitado. */
export async function estornarBaixa(tx: Tx, tipo: Tipo, lancamentoId: string) {
  const l = await tx.lancamento.findUnique({
    where: { id: lancamentoId },
    select: { id: true, contaReceberId: true, contaPagarId: true, extrato: { select: { id: true } } },
  });
  const tituloId = tipo === "receber" ? l?.contaReceberId : l?.contaPagarId;
  if (!l || !tituloId) throw new FinanceiroError("Baixa não encontrada.");
  if (l.extrato) throw new FinanceiroError("Esta baixa está conciliada com o extrato. Desfaça a conciliação antes de estornar.");
  await tx.lancamento.delete({ where: { id: lancamentoId } });
  await recalcularTitulo(tx, tipo, tituloId);
  return tituloId;
}
