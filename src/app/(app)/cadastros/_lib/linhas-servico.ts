import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

export type DadosLinha = { codigo: string; nome: string; grupo: string; ordem: number; ativo: boolean };

/** Código em maiúsculas, sem espaços nas pontas: "col-fix " e "COL-FIX" são a mesma linha. */
export const normalizarCodigoLinha = (c: string) => c.trim().toUpperCase();

/** Cria (id nulo) ou edita uma linha de produto. O código é único; repetido vira mensagem de negócio. */
export async function salvarLinhaTx(tx: Tx, id: string | null, d: DadosLinha) {
  const data = { codigo: normalizarCodigoLinha(d.codigo), nome: d.nome.trim(), grupo: d.grupo.trim(), ordem: d.ordem, ativo: d.ativo };
  if (!data.codigo || !data.nome || !data.grupo) throw new ErroNegocio("Código, nome e grupo são obrigatórios.");
  const igual = await tx.linhaProduto.findUnique({ where: { codigo: data.codigo } });
  if (igual && igual.id !== id) throw new ErroNegocio(`Já existe a linha ${igual.codigo} (${igual.nome}). O código deve ser único.`);
  if (!id) return tx.linhaProduto.create({ data });
  const atual = await tx.linhaProduto.findUnique({ where: { id } });
  if (!atual) throw new ErroNegocio("Linha não encontrada.");
  return tx.linhaProduto.update({ where: { id }, data });
}

/** Ativa/inativa. Inativar não toca nos produtos: eles continuam ligados à linha e nos relatórios. */
export async function alternarAtivoLinhaTx(tx: Tx, id: string) {
  const l = await tx.linhaProduto.findUnique({ where: { id } });
  if (!l) throw new ErroNegocio("Linha não encontrada.");
  return tx.linhaProduto.update({ where: { id }, data: { ativo: !l.ativo } });
}

/** Exclui só linha sem produto; com produto, a orientação é inativar. */
export async function excluirLinhaTx(tx: Tx, id: string) {
  const l = await tx.linhaProduto.findUnique({ where: { id }, include: { _count: { select: { produtos: true } } } });
  if (!l) throw new ErroNegocio("Linha não encontrada.");
  if (l._count.produtos > 0) throw new ErroNegocio(`Não é possível excluir: ${l._count.produtos} produto(s) nesta linha. Inative a linha em vez de excluí-la.`);
  return tx.linhaProduto.delete({ where: { id } });
}
