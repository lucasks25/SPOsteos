import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { garantirMesAberto } from "./fechamento";
import { planoPorChave, validarClassificacao, type ChaveSistema } from "./plano";

/**
 * API pública do financeiro (docs/ARQUITETURA.md, ADR-3/ADR-4): outros módulos criam e alteram títulos só por aqui,
 * DENTRO da transação deles (passam o `tx`). É aqui que moram as regras: mês fechado, conta do plano e centro de custo
 * válidos, título gerado nasce aguardando aprovação.
 */
export { CATEGORIAS_GLOSA, ROTULO_CATEGORIA_GLOSA, RECURSOS_GLOSA, ROTULO_RECURSO_GLOSA } from "./glosa-categorias";
export type { CategoriaGlosaKey, RecursoGlosaKey } from "./glosa-categorias";
export type { ChaveSistema } from "./plano";

export type NovaContaPagar = {
  descricao: string;
  fornecedorId: string | null;
  pedidoId: number | null;
  categoria: string;
  valor: number;
  vencimento: Date;
  competencia: Date;
  /** Conta do plano usada pelo sistema (PlanoConta.chaveSistema). */
  chavePlano: ChaveSistema;
};

/** Cria a conta a pagar (aprovadoEm nulo: aguarda aprovação do financeiro antes do SISPAG). Devolve o id. */
export async function gerarContaPagarTx(tx: Tx, d: NovaContaPagar): Promise<string> {
  await garantirMesAberto(tx, [d.competencia], "gerar a conta a pagar");
  const planoContaId = await planoPorChave(tx, d.chavePlano);
  await validarClassificacao(tx, planoContaId, null);
  const conta = await tx.contaPagar.create({
    data: {
      descricao: d.descricao,
      fornecedorId: d.fornecedorId,
      pedidoId: d.pedidoId,
      categoria: d.categoria,
      valor: d.valor,
      competencia: d.competencia,
      vencimento: d.vencimento,
      planoContaId,
    },
  });
  return conta.id;
}

/**
 * Trava a conta (FOR UPDATE) e confere se ainda pode mudar: em aberto, sem baixa, fora de remessa SISPAG ativa e em mês aberto.
 * Conta já CANCELADA é devolvida como está (quem chama decide).
 */
async function exigirContaAlteravel(tx: Tx, contaId: string) {
  await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id = ${contaId} FOR UPDATE`;
  const c = await tx.contaPagar.findUniqueOrThrow({ where: { id: contaId }, select: { status: true, valorBaixado: true, competencia: true, _count: { select: { pagamentos: { where: { status: { in: ["ENVIADO", "AGENDADO"] } } } } } } });
  if (c.status === "CANCELADO") return c;
  if (c.status !== "ABERTO" || c.valorBaixado !== null) throw new ErroNegocio("A conta a pagar desta despesa já tem baixa. Estorne a baixa no financeiro antes de alterar.");
  if (c._count.pagamentos > 0) throw new ErroNegocio("A conta a pagar desta despesa está numa remessa SISPAG ativa.");
  await garantirMesAberto(tx, [c.competencia], "alterar a conta a pagar da despesa");
  return c;
}

export type DadosContaPagarGerada = {
  descricao: string;
  valor: number;
  vencimento: Date;
  fornecedorId: string | null;
  chavePlano: ChaveSistema;
};

/** Altera a conta gerada por outro módulo. Devolve false (sem alterar) se ela já foi cancelada no financeiro. */
export async function alterarContaPagarGeradaTx(tx: Tx, contaId: string, d: DadosContaPagarGerada): Promise<boolean> {
  const c = await exigirContaAlteravel(tx, contaId);
  if (c.status === "CANCELADO") return false;
  const planoContaId = await planoPorChave(tx, d.chavePlano);
  await validarClassificacao(tx, planoContaId, null);
  await tx.contaPagar.update({
    where: { id: contaId },
    data: { descricao: d.descricao, valor: d.valor, vencimento: d.vencimento, fornecedorId: d.fornecedorId, planoContaId },
  });
  return true;
}

/** Cancela a conta gerada por outro módulo (mesmas condições da alteração). Conta já cancelada: não faz nada. */
export async function cancelarContaPagarGeradaTx(tx: Tx, contaId: string): Promise<void> {
  const c = await exigirContaAlteravel(tx, contaId);
  if (c.status !== "CANCELADO") await tx.contaPagar.update({ where: { id: contaId }, data: { status: "CANCELADO" } });
}

export type NovaContaReceber = {
  descricao: string;
  hospitalId: string;
  pedidoId: number | null;
  valor: number;
  vencimento: Date;
  competencia: Date;
  centroCustoId: string | null;
  chavePlano: ChaveSistema;
};

/** Cria a conta a receber (mês aberto, conta do plano e centro de custo válidos). */
export async function gerarContaReceberTx(tx: Tx, d: NovaContaReceber) {
  await garantirMesAberto(tx, [d.competencia], "gerar a conta a receber");
  const planoContaId = await planoPorChave(tx, d.chavePlano);
  await validarClassificacao(tx, planoContaId, d.centroCustoId);
  return tx.contaReceber.create({
    data: {
      descricao: d.descricao,
      hospitalId: d.hospitalId,
      pedidoId: d.pedidoId,
      valor: d.valor,
      vencimento: d.vencimento,
      competencia: d.competencia,
      planoContaId,
      centroCustoId: d.centroCustoId,
    },
  });
}
