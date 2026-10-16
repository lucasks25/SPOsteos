import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { audit } from "@/lib/forms";
import type { Perfil } from "@/generated/prisma/client";
import { CAMPOS_PAGAMENTO, descreverMudancas, podeVerDadosPagamento, type DadosPagamento } from "./favorecidos";

/**
 * Única escrita nas colunas bancárias de Fornecedor (ADR-5). Confere o perfil de novo (defesa em profundidade),
 * grava só essas colunas e audita antes/depois mascarados. A Server Action já validou o formato.
 */
export async function gravarDadosPagamento(user: { id: string; perfil: Perfil }, fornecedorId: string, dados: DadosPagamento) {
  if (!podeVerDadosPagamento(user.perfil)) throw new ErroNegocio("Acesso negado para o seu perfil.");
  const atual = await db.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!atual) throw new ErroNegocio("Fornecedor não encontrado.");
  const data = Object.fromEntries(CAMPOS_PAGAMENTO.map((k) => [k, dados[k] ?? null])) as DadosPagamento;
  const salvo = await db.fornecedor.update({ where: { id: fornecedorId }, data });
  // troca de dados bancários é o golpe clássico de desvio de pagamento: fica na auditoria com antes e depois (mascarados)
  const mudancas = descreverMudancas(atual, salvo);
  await audit(user.id, "editar dados de pagamento", "Fornecedor", salvo.id, `${salvo.razaoSocial} — ${mudancas ? `DADOS BANCÁRIOS ALTERADOS: ${mudancas}` : "sem alteração"}`);
  return salvo;
}
