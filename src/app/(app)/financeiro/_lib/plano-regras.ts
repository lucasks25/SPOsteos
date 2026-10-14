/** Regras puras do plano de contas (testadas sem banco). */
import type { TipoPlano } from "./dre";

export const TIPOS_PLANO: { value: TipoPlano; label: string }[] = [
  { value: "RECEITA", label: "Receita" },
  { value: "DEDUCAO", label: "Dedução da receita" },
  { value: "CUSTO", label: "Custo" },
  { value: "DESPESA", label: "Despesa operacional" },
  { value: "RECEITA_FINANCEIRA", label: "Receita financeira" },
  { value: "DESPESA_FINANCEIRA", label: "Despesa financeira" },
  { value: "IMPOSTO_LUCRO", label: "Imposto sobre o lucro" },
  { value: "NAO_RESULTADO", label: "Fora do resultado (estoque, empréstimo, sócios)" },
];

export const rotuloTipo = (t: TipoPlano) => TIPOS_PLANO.find((x) => x.value === t)?.label ?? t;

export const CODIGO_VALIDO = /^[0-9]+(\.[0-9]+)*$/;

export type PaiPlano = { tipo: TipoPlano; analitica: boolean; ativo: boolean; codigo: string; nome: string };

/**
 * Valida a criação de uma conta. Devolve o erro (mensagem amigável) ou null.
 * - código só com números e pontos, e começando pelo código do pai ("4.02" dentro de "4");
 * - o filho tem o mesmo tipo do pai, e o pai precisa ser um grupo (sintético) ativo.
 */
export function erroNovaConta(n: { codigo: string; tipo: TipoPlano }, pai: PaiPlano | null): string | null {
  if (!CODIGO_VALIDO.test(n.codigo)) return "Código inválido. Use números separados por ponto, como 4.02.";
  if (!pai) return null;
  if (pai.analitica) return `"${pai.nome}" é uma conta analítica e não pode ter filhas.`;
  if (!pai.ativo) return `O grupo "${pai.nome}" está inativo.`;
  if (n.tipo !== pai.tipo) return "A conta precisa ter o mesmo tipo do grupo em que está.";
  if (!n.codigo.startsWith(`${pai.codigo}.`)) return `O código precisa começar com ${pai.codigo}. (ex.: ${pai.codigo}.01).`;
  return null;
}
