import "server-only";
import type { CriterioRateio, TipoCambio, TipoDespesaImportacao } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { garantirMesAberto } from "@/app/(app)/financeiro/_lib/fechamento";
import { planoPorChave } from "@/app/(app)/financeiro/_lib/plano";
import { calcularCustoImportacao, centavos, integraCustoPadrao, ROTULO_DESPESA, TRIBUTOS_RECUPERAVEIS, type ResultadoCusto } from "./custo-importacao";
import { hojeUTC } from "@/lib/datas";
import { documentoPedido } from "./perfis";

/**
 * Regras de importação que mexem no banco (dados da importação, preços na moeda, despesas, custo nacionalizado).
 * Fora de "use server" para serem testadas sem login. Toda mutação trava a linha do pedido (FOR UPDATE), assim como
 * o recebimento: uma despesa não muda no meio de um recebimento, e depois do primeiro recebimento câmbio, preços na
 * moeda, pesos e despesas ficam TRAVADOS (o custo já entrou no custo médio e pode já ter virado CMV).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Trava o pedido até o fim da transação e devolve itens e despesas. */
export async function travarPedido(tx: Tx, pedidoId: number) {
  await tx.$queryRaw`SELECT id FROM "PedidoCompra" WHERE id = ${pedidoId} FOR UPDATE`;
  const pedido = await tx.pedidoCompra.findUnique({ where: { id: pedidoId }, include: { itens: { orderBy: { id: "asc" } }, despesas: { orderBy: { criadoEm: "asc" } } } });
  if (!pedido) throw new ErroNegocio("Pedido de compra não encontrado.");
  return pedido;
}
type PedidoTravado = Awaited<ReturnType<typeof travarPedido>>;

function exigirEditavel(p: PedidoTravado, oQue: string) {
  if (!p.importacao) throw new ErroNegocio("Este pedido não é de importação.");
  if (p.status === "CANCELADO") throw new ErroNegocio("Pedido cancelado.");
  if (p.itens.some((i) => i.recebido > 0)) {
    throw new ErroNegocio(`Não é possível ${oQue} depois do primeiro recebimento: o custo nacionalizado já entrou no estoque e no custo médio.`);
  }
}

/** Câmbio efetivo do pedido: 1 para reais. */
export const cambioDo = (p: { moeda: string; cambio: Parameters<typeof toNumber>[0] }) => (p.moeda === "BRL" ? 1 : toNumber(p.cambio));

/** Calcula o custo nacionalizado do pedido (itens + despesas carregados). Lança ErroNegocio se faltar dado. */
export function custoDoPedido(p: Pick<PedidoTravado, "moeda" | "cambio" | "itens" | "despesas">): ResultadoCusto {
  if (p.moeda !== "BRL" && !(toNumber(p.cambio) > 0)) throw new ErroNegocio("Informe o câmbio do pedido de importação.");
  const semPreco = p.itens.find((i) => i.precoMoeda === null);
  if (semPreco) throw new ErroNegocio("Informe o preço na moeda de todos os itens da importação.");
  return calcularCustoImportacao(
    p.itens.map((i) => ({ id: i.id, quantidade: i.quantidade, precoMoeda: toNumber(i.precoMoeda), pesoKg: i.pesoKg === null ? null : toNumber(i.pesoKg) })),
    p.despesas.map((d) => ({ id: d.id, tipo: d.tipo, valor: toNumber(d.valor), integraCusto: d.integraCusto, criterio: d.criterio, itemId: d.itemId })),
    cambioDo(p),
  );
}

export type DadosImportacao = {
  moeda: string;
  cambio: number | null;
  tipoCambio: TipoCambio | null;
  incoterm: string | null;
  invoice: string | null;
  numeroDi: string | null;
  dataInvoice: Date | null;
  dataRegistroDi: Date | null;
  dataDesembaraco: Date | null;
};

/** Salva os dados da importação. Moeda e câmbio só mudam antes do primeiro recebimento; os demais campos, sempre. */
export async function salvarDadosImportacaoTx(tx: Tx, pedidoId: number, d: DadosImportacao) {
  const p = await travarPedido(tx, pedidoId);
  if (!p.importacao) throw new ErroNegocio("Este pedido não é de importação.");
  if (p.status === "CANCELADO") throw new ErroNegocio("Pedido cancelado.");
  if (!/^[A-Z]{3}$/.test(d.moeda)) throw new ErroNegocio("Moeda inválida (use o código de 3 letras, ex.: USD).");
  const cambio = d.moeda === "BRL" ? null : d.cambio;
  if (d.moeda !== "BRL" && !(cambio && cambio > 0)) throw new ErroNegocio("Informe o câmbio (maior que zero) para pedido em moeda estrangeira.");
  const mudouCusto = p.moeda !== d.moeda || toNumber(p.cambio) !== (cambio ?? 0);
  if (mudouCusto) exigirEditavel(p, "alterar moeda ou câmbio");
  await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { ...d, cambio } });
  if (mudouCusto) await sincronizarCustoReais(tx, p.itens, d.moeda === "BRL" ? 1 : cambio!);
  return { mudouCusto };
}

/** custoUnit (reais) = preço na moeda × câmbio: mantém valor do pedido e listas em reais. */
async function sincronizarCustoReais(tx: Tx, itens: PedidoTravado["itens"], cambio: number) {
  for (const i of itens) {
    if (i.precoMoeda === null) continue;
    await tx.pedidoCompraItem.update({ where: { id: i.id }, data: { custoUnit: r2(toNumber(i.precoMoeda) * cambio) } });
  }
}

/** Preço na moeda e peso de cada item (antes do primeiro recebimento). */
export async function salvarItensImportacaoTx(tx: Tx, pedidoId: number, itens: { itemId: string; precoMoeda: number; pesoKg: number | null }[]) {
  const p = await travarPedido(tx, pedidoId);
  exigirEditavel(p, "alterar preços ou pesos");
  const ids = new Set(p.itens.map((i) => i.id));
  for (const i of itens) {
    if (!ids.has(i.itemId)) throw new ErroNegocio("Item não pertence a este pedido.");
    if (!(i.precoMoeda >= 0) || (i.pesoKg !== null && !(i.pesoKg >= 0))) throw new ErroNegocio("Preço ou peso inválido.");
  }
  const cambio = cambioDo(p);
  for (const i of itens) {
    await tx.pedidoCompraItem.update({ where: { id: i.itemId }, data: { precoMoeda: i.precoMoeda, pesoKg: i.pesoKg, custoUnit: r2(i.precoMoeda * cambio) } });
  }
}

export type DespesaInput = {
  tipo: TipoDespesaImportacao;
  descricao: string | null;
  valor: number;
  /** null = padrão do tipo (tributos recuperáveis não integram) */
  integraCusto: boolean | null;
  criterio: CriterioRateio;
  itemId: string | null;
  /** gera (ou mantém) conta a pagar própria */
  gerarConta: boolean;
  fornecedorId: string | null;
  vencimento: Date | null;
};

/**
 * Conta do plano da despesa (efeito no DRE):
 * - integra o custo → ESTOQUE (fora do resultado): o valor entra no custo médio e vai ao resultado só pelo CMV, na venda;
 * - tributo recuperável que não integra → TRIBUTOS_RECUPERAR (ativo, fora do resultado);
 * - outra despesa que não integra → CUSTO_IMPORTACAO (3.03, custo do mês).
 */
export async function planoDaDespesa(tx: Tx, tipo: TipoDespesaImportacao, integraCusto: boolean) {
  if (integraCusto) return planoPorChave(tx, "ESTOQUE");
  return planoPorChave(tx, TRIBUTOS_RECUPERAVEIS.includes(tipo) ? "TRIBUTOS_RECUPERAR" : "CUSTO_IMPORTACAO");
}

async function validarDespesa(tx: Tx, p: PedidoTravado, d: DespesaInput) {
  if (!(d.valor >= 0) || centavos(d.valor) !== Math.round(d.valor * 100)) throw new ErroNegocio("Valor da despesa inválido.");
  if (d.itemId && !p.itens.some((i) => i.id === d.itemId)) throw new ErroNegocio("Item não pertence a este pedido.");
  if (d.criterio === "PESO") {
    const alvo = p.itens.filter((i) => !d.itemId || i.id === d.itemId);
    if (alvo.some((i) => i.pesoKg === null)) throw new ErroNegocio("Para ratear por peso, informe antes o peso dos itens.");
  }
  if (d.gerarConta) {
    if (!(d.valor > 0)) throw new ErroNegocio("Despesa com valor zero não gera conta a pagar.");
    if (!d.vencimento) throw new ErroNegocio("Informe o vencimento da conta a pagar.");
    if (d.fornecedorId) {
      const f = await tx.fornecedor.findUnique({ where: { id: d.fornecedorId }, select: { ativo: true } });
      if (!f?.ativo) throw new ErroNegocio("Fornecedor da despesa inexistente ou inativo.");
    }
  }
}

const descricaoConta = (pedidoId: number, d: { tipo: TipoDespesaImportacao; descricao: string | null }) =>
  `${documentoPedido(pedidoId)} — ${ROTULO_DESPESA[d.tipo]}${d.descricao ? ` (${d.descricao})` : ""}`;

/** Conta só pode mudar/cancelar se estiver em aberto, sem baixa, fora de remessa SISPAG ativa e em mês aberto. */
async function exigirContaAlteravel(tx: Tx, contaId: string) {
  await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id = ${contaId} FOR UPDATE`;
  const c = await tx.contaPagar.findUniqueOrThrow({ where: { id: contaId }, select: { status: true, valorBaixado: true, competencia: true, _count: { select: { pagamentos: { where: { status: { in: ["ENVIADO", "AGENDADO"] } } } } } } });
  if (c.status === "CANCELADO") return c;
  if (c.status !== "ABERTO" || c.valorBaixado !== null) throw new ErroNegocio("A conta a pagar desta despesa já tem baixa. Estorne a baixa no financeiro antes de alterar.");
  if (c._count.pagamentos > 0) throw new ErroNegocio("A conta a pagar desta despesa está numa remessa SISPAG ativa.");
  await garantirMesAberto(tx, [c.competencia], "alterar a conta a pagar da despesa");
  return c;
}

async function criarConta(tx: Tx, pedidoId: number, d: DespesaInput, integra: boolean) {
  const hoje = hojeUTC();
  await garantirMesAberto(tx, [hoje], "gerar a conta a pagar da despesa");
  const conta = await tx.contaPagar.create({
    data: {
      descricao: descricaoConta(pedidoId, d),
      fornecedorId: d.fornecedorId,
      pedidoId,
      categoria: "Custos de importação",
      valor: d.valor,
      competencia: hoje,
      vencimento: d.vencimento!,
      planoContaId: await planoDaDespesa(tx, d.tipo, integra),
      // aprovadoEm nulo: como a conta do recebimento, aguarda aprovação do financeiro antes do SISPAG
    },
  });
  return conta.id;
}

/** Inclui (despesaId nulo) ou altera uma despesa. Só antes do primeiro recebimento. */
export async function salvarDespesaTx(tx: Tx, pedidoId: number, despesaId: string | null, d: DespesaInput) {
  const p = await travarPedido(tx, pedidoId);
  exigirEditavel(p, despesaId ? "alterar despesas" : "incluir despesas");
  await validarDespesa(tx, p, d);
  const integra = d.integraCusto ?? integraCustoPadrao(d.tipo);
  const dados = { tipo: d.tipo, descricao: d.descricao, valor: d.valor, integraCusto: integra, criterio: d.criterio, itemId: d.itemId };

  if (!despesaId) {
    const contaPagarId = d.gerarConta ? await criarConta(tx, pedidoId, d, integra) : null;
    const nova = await tx.pedidoCompraDespesa.create({ data: { pedidoId, ...dados, contaPagarId } });
    return { id: nova.id, contaPagarId };
  }

  const atual = p.despesas.find((x) => x.id === despesaId);
  if (!atual) throw new ErroNegocio("Despesa não encontrada neste pedido.");
  let contaPagarId = atual.contaPagarId;
  if (contaPagarId) {
    const c = await exigirContaAlteravel(tx, contaPagarId);
    if (c.status === "CANCELADO") contaPagarId = null; // cancelada no financeiro: desvincula
    else if (d.gerarConta) {
      await tx.contaPagar.update({
        where: { id: contaPagarId },
        data: { descricao: descricaoConta(pedidoId, d), valor: d.valor, vencimento: d.vencimento!, fornecedorId: d.fornecedorId, planoContaId: await planoDaDespesa(tx, d.tipo, integra) },
      });
    } else {
      await tx.contaPagar.update({ where: { id: contaPagarId }, data: { status: "CANCELADO" } });
      contaPagarId = null;
    }
  }
  if (!contaPagarId && d.gerarConta) contaPagarId = await criarConta(tx, pedidoId, d, integra);
  await tx.pedidoCompraDespesa.update({ where: { id: despesaId }, data: { ...dados, contaPagarId } });
  return { id: despesaId, contaPagarId };
}

/** Remove a despesa (antes do primeiro recebimento); a conta a pagar própria, se houver, é cancelada. */
export async function removerDespesaTx(tx: Tx, pedidoId: number, despesaId: string) {
  const p = await travarPedido(tx, pedidoId);
  exigirEditavel(p, "remover despesas");
  const atual = p.despesas.find((x) => x.id === despesaId);
  if (!atual) throw new ErroNegocio("Despesa não encontrada neste pedido.");
  if (atual.contaPagarId) {
    const c = await exigirContaAlteravel(tx, atual.contaPagarId);
    if (c.status !== "CANCELADO") await tx.contaPagar.update({ where: { id: atual.contaPagarId }, data: { status: "CANCELADO" } });
  }
  await tx.pedidoCompraDespesa.delete({ where: { id: despesaId } });
  return { tipo: atual.tipo, valor: toNumber(atual.valor), contaCancelada: !!atual.contaPagarId };
}
