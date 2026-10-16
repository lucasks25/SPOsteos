import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import type { Tipo } from "./config";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";

/** Regras de criar, editar, cancelar e classificar título que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */

type DadosReceber = { descricao: string; hospitalId: string | null; planoContaId: string; centroCustoId: string | null; competencia: Date; valor: number; vencimento: Date };
type DadosPagar = { descricao: string; fornecedorId: string | null; planoContaId: string; centroCustoId: string | null; competencia: Date; codigoBarras: string | null; valor: number; vencimento: Date };

/** Competência atual do título (para recusar mudanças em mês fechado). */
async function competenciaDo(tx: Tx, tipo: Tipo, id: string): Promise<Date | null> {
  const sel = { competencia: true } as const;
  const t = tipo === "receber" ? await tx.contaReceber.findUnique({ where: { id }, select: sel }) : await tx.contaPagar.findUnique({ where: { id }, select: sel });
  return t?.competencia ?? null;
}

/** Cria (id = null) ou edita um título a receber em aberto e sem baixas. Devolve o id. */
export async function salvarContaReceberTx(tx: Tx, id: string | null, data: DadosReceber): Promise<string> {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  await garantirMesAberto(tx, [data.competencia, id ? await competenciaDo(tx, "receber", id) : null], "criar ou alterar título nessa competência");
  if (!id) return (await tx.contaReceber.create({ data })).id;
  const r = await tx.contaReceber.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data });
  if (r.count === 0) throw new ErroNegocio("Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes.");
  return id;
}

/** Cria (id = null) ou edita uma conta a pagar em aberto e sem baixas. Conta criada à mão nasce aprovada por quem a criou. */
export async function salvarContaPagarTx(tx: Tx, id: string | null, data: DadosPagar, usuarioId: string): Promise<string> {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  await garantirMesAberto(tx, [data.competencia, id ? await competenciaDo(tx, "pagar", id) : null], "criar ou alterar título nessa competência");
  if (!id) return (await tx.contaPagar.create({ data: { ...data, aprovadoEm: new Date(), aprovadoPor: usuarioId } })).id;
  const r = await tx.contaPagar.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data });
  if (r.count === 0) throw new ErroNegocio("Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes.");
  return id;
}

/** Cancela um título em aberto e sem baixas. */
export async function cancelarTituloTx(tx: Tx, tipo: Tipo, id: string) {
  const data = { status: "CANCELADO" as const };
  await garantirMesAberto(tx, [await competenciaDo(tx, tipo, id)], "cancelar título dessa competência");
  if (tipo === "receber") {
    // Cancelar a receita de uma NF emitida tiraria a venda do DRE e deixaria o custo (CMV): precisa de cancelamento de NF/devolução.
    const t = await tx.contaReceber.findUnique({ where: { id }, select: { pedido: { select: { status: true } } } });
    if (t?.pedido?.status === "FATURADO") throw new ErroNegocio("Este título vem de uma NF emitida. Para desfazê-lo é preciso cancelar a NF ou registrar uma devolução.");
  }
  const where = { id, status: "ABERTO" as const, valorBaixado: null };
  const r = tipo === "receber" ? await tx.contaReceber.updateMany({ where, data }) : await tx.contaPagar.updateMany({ where, data });
  if (r.count === 0) throw new ErroNegocio("Só é possível cancelar títulos em aberto e sem baixas. Estorne as baixas antes.");
}

/** Classifica (ou reclassifica) um título em qualquer situação: não mexe em valor nem em baixas. */
export async function classificarTituloTx(tx: Tx, tipo: Tipo, id: string, data: { planoContaId: string; centroCustoId: string | null; competencia: Date }) {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  await garantirMesAberto(tx, [data.competencia, await competenciaDo(tx, tipo, id)], "reclassificar título dessa competência");
  const r = tipo === "receber" ? await tx.contaReceber.updateMany({ where: { id }, data }) : await tx.contaPagar.updateMany({ where: { id }, data });
  if (r.count === 0) throw new ErroNegocio("Título não encontrado.");
}
