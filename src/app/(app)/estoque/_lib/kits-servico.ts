import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/** Kits de remessa (modelos de itens). Fora de "use server" para ser testado sem login. */

export async function criarKit(tx: Tx, d: { codigo: string; descricao: string }) {
  return tx.kit.create({ data: d });
}

export async function editarKit(tx: Tx, id: string, d: { codigo: string; descricao: string }) {
  return tx.kit.update({ where: { id }, data: d });
}

/** Item repetido soma a quantidade no item existente. */
export async function adicionarItemKit(tx: Tx, kitId: string, d: { produtoId: string; quantidade: number }) {
  const ex = await tx.kitItem.findFirst({ where: { kitId, produtoId: d.produtoId } });
  if (ex) return tx.kitItem.update({ where: { id: ex.id }, data: { quantidade: ex.quantidade + d.quantidade } });
  return tx.kitItem.create({ data: { kitId, ...d } });
}

export async function removerItemKit(tx: Tx, itemId: string) {
  return tx.kitItem.delete({ where: { id: itemId } });
}

/** Kit usado em remessa não pode ser excluído. */
export async function excluirKit(tx: Tx, id: string) {
  const n = await tx.remessa.count({ where: { kitId: id } });
  if (n > 0) throw new ErroNegocio(`Não é possível excluir: usado em ${n} remessa(s).`);
  return tx.kit.delete({ where: { id } });
}
