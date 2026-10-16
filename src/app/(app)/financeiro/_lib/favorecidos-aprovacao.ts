import "server-only";
import { createHash } from "node:crypto";
import type { Perfil } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { podeVerDadosPagamento } from "./favorecidos";

/**
 * Dupla checagem dos dados de pagamento do favorecido (docs/REVISAO.md §19, achado S2).
 *
 * Golpe que isto fecha: alguém troca a conta/Pix de um fornecedor e gera a remessa SISPAG em seguida; o banco paga
 * a conta nova. Agora o SISPAG só paga se a "impressão digital" dos dados (CNPJ + banco/agência/conta/dígito + Pix)
 * for igual à aprovada, e quem alterou os dados não pode aprová-los. Voltar aos dados aprovados dispensa nova aprovação.
 * O CNPJ entra porque vai no arquivo como documento do favorecido (e é editado em Cadastros, por outro setor).
 */
export type DadosHash = { cnpj: string | null; bancoCodigo: string | null; agencia: string | null; conta: string | null; contaDigito: string | null; chavePix: string | null };

/** Mesmo cálculo do SQL da migration 20261016200000_aprovacao_dados_pagamento. */
export function hashDadosPagamento(f: DadosHash): string {
  const texto = [f.cnpj, f.bancoCodigo, f.agencia, f.conta, f.contaDigito, f.chavePix].map((v) => v ?? "").join("|");
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export type SituacaoAprovacao = "APROVADO" | "PENDENTE";
export const situacaoAprovacao = (f: DadosHash & { pagamentoAprovadoHash: string | null }): SituacaoAprovacao =>
  f.pagamentoAprovadoHash !== null && f.pagamentoAprovadoHash === hashDadosPagamento(f) ? "APROVADO" : "PENDENTE";

/** Trava as linhas dos fornecedores: a edição (FOR UPDATE) espera a geração da remessa terminar, e vice-versa. */
export async function travarFornecedores(tx: Tx, ids: string[], modo: "UPDATE" | "SHARE") {
  if (ids.length === 0) return;
  const lista = [...new Set(ids)].sort();
  if (modo === "UPDATE") await tx.$queryRaw`SELECT id FROM "Fornecedor" WHERE id = ANY(${lista}::text[]) ORDER BY id FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "Fornecedor" WHERE id = ANY(${lista}::text[]) ORDER BY id FOR SHARE`;
}

/**
 * Aprova os dados de pagamento atuais. `hashVisto` é o hash dos dados que o aprovador viu na tela: se alguém alterou
 * depois, a aprovação é recusada (não se aprova o que não se viu). Quem fez a última alteração não aprova.
 */
export async function aprovarDadosPagamentoTx(tx: Tx, user: { id: string; perfil: Perfil }, fornecedorId: string, hashVisto: string) {
  if (!podeVerDadosPagamento(user.perfil)) throw new ErroNegocio("Acesso negado para o seu perfil.");
  await travarFornecedores(tx, [fornecedorId], "UPDATE");
  const f = await tx.fornecedor.findUnique({
    where: { id: fornecedorId },
    select: { razaoSocial: true, cnpj: true, bancoCodigo: true, agencia: true, conta: true, contaDigito: true, chavePix: true, pagamentoAprovadoHash: true, pagamentoAlteradoPor: true },
  });
  if (!f) throw new ErroNegocio("Fornecedor não encontrado.");
  const atual = hashDadosPagamento(f);
  if (atual !== hashVisto) throw new ErroNegocio("Os dados de pagamento mudaram desde que a tela foi aberta. Recarregue e confira de novo.");
  if (f.pagamentoAprovadoHash === atual) throw new ErroNegocio("Estes dados de pagamento já estão aprovados.");
  if (f.pagamentoAlteradoPor && f.pagamentoAlteradoPor === user.id) {
    throw new ErroNegocio("Quem alterou os dados de pagamento não pode aprová-los. Peça a outra pessoa do financeiro ou ao administrador.");
  }
  await tx.fornecedor.update({ where: { id: fornecedorId }, data: { pagamentoAprovadoHash: atual, pagamentoAprovadoEm: new Date(), pagamentoAprovadoPor: user.id } });
  return { razaoSocial: f.razaoSocial, hash: atual };
}
