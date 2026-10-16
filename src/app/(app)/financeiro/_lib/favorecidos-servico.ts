import { db } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { audit } from "@/lib/forms";
import type { Perfil } from "@/generated/prisma/client";
import { CAMPOS_PAGAMENTO, descreverMudancas, podeVerDadosPagamento, type DadosPagamento } from "./favorecidos";
import { aprovarDadosPagamentoTx, situacaoAprovacao, travarFornecedores } from "./favorecidos-aprovacao";

/**
 * Única escrita nas colunas bancárias de Fornecedor (ADR-5). Confere o perfil de novo (defesa em profundidade),
 * grava só essas colunas e audita antes/depois mascarados. A Server Action já validou o formato.
 * Alteração real marca quem alterou: o SISPAG recusa o favorecido até outra pessoa aprovar (favorecidos-aprovacao.ts).
 */
export async function gravarDadosPagamento(user: { id: string; perfil: Perfil }, fornecedorId: string, dados: DadosPagamento) {
  if (!podeVerDadosPagamento(user.perfil)) throw new ErroNegocio("Acesso negado para o seu perfil.");
  const { salvo, mudancas } = await db.$transaction(async (tx) => {
    await travarFornecedores(tx, [fornecedorId], "UPDATE"); // espera remessa SISPAG em geração com este favorecido
    const atual = await tx.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!atual) throw new ErroNegocio("Fornecedor não encontrado.");
    const data = Object.fromEntries(CAMPOS_PAGAMENTO.map((k) => [k, dados[k] ?? null])) as DadosPagamento;
    const mudancas = descreverMudancas(atual, data);
    const salvo = await tx.fornecedor.update({
      where: { id: fornecedorId },
      data: { ...data, ...(mudancas ? { pagamentoAlteradoEm: new Date(), pagamentoAlteradoPor: user.id } : {}) },
    });
    return { salvo, mudancas };
  });
  // troca de dados bancários é o golpe clássico de desvio de pagamento: fica na auditoria com antes e depois (mascarados)
  const pendente = mudancas && situacaoAprovacao(salvo) === "PENDENTE" ? " — AGUARDANDO APROVAÇÃO de outra pessoa antes de entrar no SISPAG" : "";
  await audit(user.id, "editar dados de pagamento", "Fornecedor", salvo.id, `${salvo.razaoSocial} — ${mudancas ? `DADOS BANCÁRIOS ALTERADOS: ${mudancas}${pendente}` : "sem alteração"}`);
  return salvo;
}

/** Aprova os dados de pagamento (dupla checagem) e audita. */
export async function aprovarDadosPagamento(user: { id: string; perfil: Perfil }, fornecedorId: string, hashVisto: string) {
  const r = await db.$transaction((tx) => aprovarDadosPagamentoTx(tx, user, fornecedorId, hashVisto));
  await audit(user.id, "aprovar dados de pagamento", "Fornecedor", fornecedorId, `${r.razaoSocial} — hash ${r.hash.slice(0, 12)}`);
}
