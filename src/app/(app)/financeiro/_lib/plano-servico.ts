import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { erroNovaConta } from "./plano-regras";

/** Regras de plano de contas e centro de custo que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */

/** Cria uma conta ou um grupo no plano. */
export async function criarContaPlanoTx(tx: Tx, d: { codigo: string; nome: string; tipo: string; paiId: string | null; analitica: boolean }) {
  const pai = d.paiId ? await tx.planoConta.findUnique({ where: { id: d.paiId }, select: { tipo: true, analitica: true, ativo: true, codigo: true, nome: true } }) : null;
  if (d.paiId && !pai) throw new ErroNegocio("Grupo não encontrado.");
  const erro = erroNovaConta({ codigo: d.codigo, tipo: d.tipo as never }, pai);
  if (erro) throw new ErroNegocio(erro);
  if (await tx.planoConta.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) throw new ErroNegocio(`Já existe uma conta com o código ${d.codigo}.`);
  return tx.planoConta.create({ data: { codigo: d.codigo, nome: d.nome, tipo: d.tipo as never, paiId: d.paiId, analitica: d.analitica } });
}

/** Inativa ou reativa uma conta. Contas do sistema não podem ser inativadas; grupo só inativa sem filhas ativas. */
export async function alternarContaPlanoTx(tx: Tx, id: string) {
  const c = await tx.planoConta.findUnique({ where: { id }, select: { ativo: true, chaveSistema: true, nome: true, pai: { select: { ativo: true } }, _count: { select: { filhos: { where: { ativo: true } } } } } });
  if (!c) throw new ErroNegocio("Conta não encontrada.");
  if (c.ativo) {
    if (c.chaveSistema) throw new ErroNegocio(`"${c.nome}" é usada pelo sistema e não pode ser inativada.`);
    if (c._count.filhos > 0) throw new ErroNegocio("Inative primeiro as contas dentro deste grupo.");
  } else if (c.pai && !c.pai.ativo) {
    throw new ErroNegocio("Reative primeiro o grupo desta conta.");
  }
  await tx.planoConta.update({ where: { id }, data: { ativo: !c.ativo } });
  return { eraAtiva: c.ativo, nome: c.nome };
}

export async function criarCentroCustoTx(tx: Tx, d: { codigo: string; nome: string }) {
  if (await tx.centroCusto.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) throw new ErroNegocio(`Já existe um centro de custo com o código ${d.codigo}.`);
  return tx.centroCusto.create({ data: d });
}

export async function alternarCentroCustoTx(tx: Tx, id: string) {
  const c = await tx.centroCusto.findUnique({ where: { id }, select: { ativo: true, nome: true } });
  if (!c) throw new ErroNegocio("Centro de custo não encontrado.");
  await tx.centroCusto.update({ where: { id }, data: { ativo: !c.ativo } });
  return { eraAtivo: c.ativo, nome: c.nome };
}
