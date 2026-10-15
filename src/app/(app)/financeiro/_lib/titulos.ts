import "server-only";
import type { FormaPagamento } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { money, toNumber } from "@/lib/format";
import type { Tipo } from "./config";
import { garantirMesAberto } from "./fechamento";

/** Regra de negócio violada (mensagem já amigável para o usuário). */
export class FinanceiroError extends ErroNegocio {}

const cent = (n: number) => Math.round(n * 100);
export const arredondar = (n: number) => cent(n) / 100;

// ───────────── regras puras (testadas sem banco) ─────────────

/** Saldo em aberto do título: o que falta extinguir. `valorBaixado` = Σ(principal + desconto) das baixas. */
export function saldoTitulo(valor: number, valorBaixado: number | null | undefined): number {
  return Math.max(0, arredondar(valor - (valorBaixado ?? 0)));
}

/** PAGO quando o que foi extinto (principal + desconto) cobre o valor do título. */
export function situacaoTitulo(valor: number, valorBaixado: number): "PAGO" | "ABERTO" {
  return cent(valorBaixado) >= cent(valor) ? "PAGO" : "ABERTO";
}

export type EntradaBaixa = { valor: number; juros?: number; multa?: number; desconto?: number };
export type BaixaCalculada = { valor: number; principal: number; juros: number; multa: number; desconto: number };

/**
 * Calcula uma baixa. `valor` é o dinheiro que move a conta (inclui juros e multa, não inclui desconto).
 *   principal = valor − juros − multa      (o dinheiro que abate o título)
 *   extinto   = principal + desconto       (o quanto do título sai do saldo)
 * Ex.: título 1000 pago com 980 e 20 de desconto → principal 980, extinto 1000.
 * O extinto não pode passar do saldo do título (sem "juros implícito").
 */
export function calcularBaixa(e: EntradaBaixa, saldoAntes: number): BaixaCalculada {
  const juros = arredondar(e.juros ?? 0);
  const multa = arredondar(e.multa ?? 0);
  const desconto = arredondar(e.desconto ?? 0);
  const valor = arredondar(e.valor);
  if (![valor, juros, multa, desconto].every(Number.isFinite)) throw new FinanceiroError("Valor inválido.");
  if (juros < 0 || multa < 0 || desconto < 0) throw new FinanceiroError("Juros, multa e desconto não podem ser negativos.");
  if (!(cent(valor) > 0)) throw new FinanceiroError("Informe um valor maior que zero.");
  const principal = arredondar(valor - juros - multa);
  if (principal < 0) throw new FinanceiroError("Juros e multa não podem ser maiores que o valor movimentado.");
  const extinto = arredondar(principal + desconto);
  if (!(cent(extinto) > 0)) throw new FinanceiroError("A baixa precisa abater alguma parte do título.");
  if (cent(extinto) > cent(saldoAntes)) {
    if (cent(juros + multa + desconto) === 0) {
      throw new FinanceiroError(`O valor (${money(valor)}) é maior que o saldo do título (${money(saldoAntes)}). Para pagar acima do saldo, informe os juros ou a multa.`);
    }
    throw new FinanceiroError(`A baixa abate ${money(extinto)} do título, mas o saldo é ${money(saldoAntes)}.`);
  }
  return { valor, principal, juros, multa, desconto };
}

// ───────────── acesso ao banco ─────────────

type TituloBasico = { id: string; descricao: string; valor: number; valorBaixado: number; status: "ABERTO" | "PAGO" | "CANCELADO" };

/** Lê o título; com `travar`, bloqueia a linha até o fim da transação (impede duas baixas simultâneas). */
async function carregar(tx: Tx, tipo: Tipo, id: string, travar = false): Promise<TituloBasico> {
  if (travar) {
    if (tipo === "receber") await tx.$queryRaw`SELECT id FROM "ContaReceber" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id = ${id} FOR UPDATE`;
  }
  const sel = { id: true, descricao: true, valor: true, valorBaixado: true, status: true } as const;
  const t = tipo === "receber" ? await tx.contaReceber.findUnique({ where: { id }, select: sel }) : await tx.contaPagar.findUnique({ where: { id }, select: sel });
  if (!t) throw new FinanceiroError("Título não encontrado.");
  return { ...t, valor: toNumber(t.valor), valorBaixado: toNumber(t.valorBaixado) };
}

const filtroLancamentos = (tipo: Tipo, id: string) => (tipo === "receber" ? { contaReceberId: id } : { contaPagarId: id });

/**
 * Recalcula valorPago (dinheiro), valorBaixado (principal + desconto), pagoEm e status do título
 * a partir dos lançamentos. É o único lugar que escreve esses campos, para o título nunca divergir do caixa.
 */
export async function recalcularTitulo(tx: Tx, tipo: Tipo, id: string) {
  const titulo = await carregar(tx, tipo, id);
  const s = await tx.lancamento.aggregate({ where: filtroLancamentos(tipo, id), _sum: { valor: true, principal: true, desconto: true }, _max: { data: true }, _count: true });
  // glosa (só contas a receber) extingue parte do título sem dinheiro, como o desconto, mas não conta como baixa de caixa
  const g = tipo === "receber" ? await tx.glosa.aggregate({ where: { contaReceberId: id }, _sum: { valor: true }, _max: { data: true }, _count: true }) : null;
  const glosado = toNumber(g?._sum.valor);
  const pago = toNumber(s._sum.valor);
  const baixado = arredondar(toNumber(s._sum.principal) + toNumber(s._sum.desconto) + glosado);
  const ultima = [s._max.data, g?._max.data].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const data = {
    valorPago: s._count > 0 ? pago : null,
    valorBaixado: s._count > 0 || (g?._count ?? 0) > 0 ? baixado : null,
    pagoEm: ultima,
    status: situacaoTitulo(titulo.valor, baixado),
  };
  if (tipo === "receber") await tx.contaReceber.update({ where: { id }, data });
  else await tx.contaPagar.update({ where: { id }, data });
  return data;
}

export type BaixaInput = {
  tipo: Tipo;
  tituloId: string;
  contaId: string;
  data: Date;
  valor: number;
  juros?: number;
  multa?: number;
  desconto?: number;
  forma?: FormaPagamento | null;
};

/** Registra um pagamento/recebimento (total ou parcial, com juros, multa e desconto) e atualiza o título. */
export async function registrarBaixa(tx: Tx, input: BaixaInput) {
  const { tipo, tituloId, contaId, data, forma } = input;
  await garantirMesAberto(tx, [data], "registrar baixa nessa data");
  const titulo = await carregar(tx, tipo, tituloId, true);
  if (titulo.status !== "ABERTO") throw new FinanceiroError("O título não está em aberto.");
  const b = calcularBaixa(input, saldoTitulo(titulo.valor, titulo.valorBaixado));
  const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
  if (!conta) throw new FinanceiroError("Conta bancária não encontrada.");
  if (!conta.ativo) throw new FinanceiroError("A conta bancária está inativa.");

  const lancamento = await tx.lancamento.create({
    data: {
      contaId,
      data,
      valor: b.valor,
      principal: b.principal,
      juros: b.juros,
      multa: b.multa,
      desconto: b.desconto,
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
    select: { id: true, data: true, contaReceberId: true, contaPagarId: true, extrato: { select: { id: true } } },
  });
  if (l) await garantirMesAberto(tx, [l.data], "estornar uma baixa dessa data");
  const tituloId = tipo === "receber" ? l?.contaReceberId : l?.contaPagarId;
  if (!l || !tituloId) throw new FinanceiroError("Baixa não encontrada.");
  if (l.extrato) throw new FinanceiroError("Esta baixa está conciliada com o extrato. Desfaça a conciliação antes de estornar.");
  await carregar(tx, tipo, tituloId, true);
  await tx.lancamento.delete({ where: { id: lancamentoId } });
  await recalcularTitulo(tx, tipo, tituloId);
  return tituloId;
}

// ───────────── glosa (só contas a receber) ─────────────

export type GlosaInput = { tituloId: string; valor: number; data: Date; motivo: string };

/** Registra a glosa: abate o saldo do título sem mexer no caixa. Não pode passar do saldo. */
export async function registrarGlosa(tx: Tx, input: GlosaInput) {
  const motivo = input.motivo.trim();
  const valor = arredondar(input.valor);
  if (!Number.isFinite(valor) || !(cent(valor) > 0)) throw new FinanceiroError("Informe um valor de glosa maior que zero.");
  if (motivo.length < 5) throw new FinanceiroError("Explique o motivo da glosa (mínimo 5 letras).");
  await garantirMesAberto(tx, [input.data], "registrar glosa nessa data");
  const titulo = await carregar(tx, "receber", input.tituloId, true);
  if (titulo.status !== "ABERTO") throw new FinanceiroError("O título não está em aberto.");
  const saldo = saldoTitulo(titulo.valor, titulo.valorBaixado);
  if (cent(valor) > cent(saldo)) throw new FinanceiroError(`A glosa (${money(valor)}) é maior que o saldo do título (${money(saldo)}).`);
  const g = await tx.glosa.create({ data: { contaReceberId: input.tituloId, valor, data: input.data, motivo } });
  await recalcularTitulo(tx, "receber", input.tituloId);
  return g;
}

/** Estorna a glosa e reabre o título se ele deixar de estar quitado. */
export async function estornarGlosa(tx: Tx, glosaId: string) {
  const g = await tx.glosa.findUnique({ where: { id: glosaId }, select: { contaReceberId: true, data: true } });
  if (!g) throw new FinanceiroError("Glosa não encontrada.");
  await garantirMesAberto(tx, [g.data], "estornar uma glosa dessa data");
  await carregar(tx, "receber", g.contaReceberId, true);
  await tx.glosa.delete({ where: { id: glosaId } });
  await recalcularTitulo(tx, "receber", g.contaReceberId);
  return g.contaReceberId;
}

// ───────────── transferência entre contas ─────────────

export type TransferenciaInput = { origemId: string; destinoId: string; valor: number; data: Date; descricao: string };

/** Cria a transferência: SAIDA na origem e ENTRADA no destino, ligadas por `Transferencia`. */
export async function transferir(tx: Tx, input: TransferenciaInput) {
  const { origemId, destinoId, data } = input;
  const valor = arredondar(input.valor);
  await garantirMesAberto(tx, [data], "transferir nessa data");
  if (origemId === destinoId) throw new FinanceiroError("Origem e destino precisam ser contas diferentes.");
  if (!(cent(valor) > 0)) throw new FinanceiroError("Informe um valor maior que zero.");
  const contas = await tx.contaBancaria.findMany({ where: { id: { in: [origemId, destinoId] } }, select: { id: true, nome: true, ativo: true } });
  if (contas.length !== 2) throw new FinanceiroError("Conta de origem ou destino não encontrada.");
  const inativa = contas.find((c) => !c.ativo);
  if (inativa) throw new FinanceiroError(`A conta ${inativa.nome} está inativa.`);
  const nome = (id: string) => contas.find((c) => c.id === id)!.nome;

  const t = await tx.transferencia.create({ data: { data, valor, descricao: input.descricao } });
  const base = { data, valor, transferenciaId: t.id, categoria: "Transferência" };
  await tx.lancamento.create({ data: { ...base, contaId: origemId, sentido: "SAIDA", descricao: `${input.descricao} → ${nome(destinoId)}` } });
  await tx.lancamento.create({ data: { ...base, contaId: destinoId, sentido: "ENTRADA", descricao: `${input.descricao} ← ${nome(origemId)}` } });
  return t;
}

/** Estorna a transferência inteira (as duas pernas). Bloqueado se alguma perna já foi conciliada com o extrato. */
export async function estornarTransferencia(tx: Tx, transferenciaId: string) {
  const pernas = await tx.lancamento.findMany({ where: { transferenciaId }, select: { id: true, data: true, extrato: { select: { id: true } } } });
  if (pernas.length === 0) throw new FinanceiroError("Transferência não encontrada.");
  await garantirMesAberto(tx, pernas.map((p) => p.data), "estornar uma transferência dessa data");
  if (pernas.some((p) => p.extrato)) throw new FinanceiroError("Uma das pernas da transferência está conciliada com o extrato. Desfaça a conciliação antes de estornar.");
  await tx.lancamento.deleteMany({ where: { transferenciaId } });
  await tx.transferencia.delete({ where: { id: transferenciaId } });
}
