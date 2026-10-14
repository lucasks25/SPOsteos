import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/** Contas que o sistema usa sozinho (PlanoConta.chaveSistema). */
export type ChaveSistema =
  | "RECEITA_VENDA"
  | "ESTOQUE"
  | "CMV"
  | "PERDA_ESTOQUE"
  | "GLOSA"
  | "JUROS_RECEBIDOS"
  | "DESCONTO_OBTIDO"
  | "JUROS_PAGOS"
  | "DESCONTO_CONCEDIDO";

/** Id da conta do sistema; falha com mensagem clara se alguém a apagou. */
export async function planoPorChave(tx: Tx, chave: ChaveSistema): Promise<string> {
  const p = await tx.planoConta.findUnique({ where: { chaveSistema: chave }, select: { id: true } });
  if (!p) throw new ErroNegocio(`A conta do sistema ${chave} não existe no plano de contas.`);
  return p.id;
}

/** Só conta analítica e ativa recebe título ou lançamento; o centro de custo, se informado, precisa estar ativo. */
export async function validarClassificacao(tx: Tx, planoContaId: string | null, centroCustoId: string | null) {
  if (planoContaId) {
    const p = await tx.planoConta.findUnique({ where: { id: planoContaId }, select: { analitica: true, ativo: true, nome: true } });
    if (!p) throw new ErroNegocio("Conta do plano não encontrada.");
    if (!p.analitica) throw new ErroNegocio(`"${p.nome}" é um grupo. Escolha uma conta analítica dentro dele.`);
    if (!p.ativo) throw new ErroNegocio(`A conta "${p.nome}" está inativa.`);
  }
  if (centroCustoId) {
    const c = await tx.centroCusto.findUnique({ where: { id: centroCustoId }, select: { ativo: true, nome: true } });
    if (!c) throw new ErroNegocio("Centro de custo não encontrado.");
    if (!c.ativo) throw new ErroNegocio(`O centro de custo "${c.nome}" está inativo.`);
  }
}

export type Opcao = { value: string; label: string };

/** Opções dos selects de classificação: contas analíticas ativas e centros de custo ativos. */
export async function opcoesClassificacao(db: Pick<Tx, "planoConta" | "centroCusto">, incluirIds: (string | null | undefined)[] = []) {
  const extras = incluirIds.filter((x): x is string => !!x);
  const [planos, centros] = await Promise.all([
    db.planoConta.findMany({ where: { OR: [{ analitica: true, ativo: true }, { id: { in: extras } }] }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    db.centroCusto.findMany({ where: { OR: [{ ativo: true }, { id: { in: extras } }] }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
  ]);
  const op = (r: { id: string; codigo: string; nome: string }): Opcao => ({ value: r.id, label: `${r.codigo} — ${r.nome}` });
  return { planos: planos.map(op), centros: centros.map(op) };
}
