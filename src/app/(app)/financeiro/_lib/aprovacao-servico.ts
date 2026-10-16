import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/**
 * Aprova contas a pagar abertas e ainda não aprovadas. Devolve quantas foram aprovadas; recusa se nenhuma pôde ser.
 * Não confere mês fechado (decisão de 16/10/2026): aprovar só libera a conta para o SISPAG, não muda DRE nem caixa;
 * a baixa, quando vier, é que respeita o fechamento pela data do pagamento.
 */
export async function aprovarContasPagarTx(tx: Tx, ids: string[], usuarioId: string): Promise<number> {
  if (ids.length === 0) throw new ErroNegocio("Selecione ao menos uma conta.");
  if (ids.length > 500) throw new ErroNegocio("Máximo de 500 por vez.");
  const r = await tx.contaPagar.updateMany({ where: { id: { in: ids }, aprovadoEm: null, status: "ABERTO" }, data: { aprovadoEm: new Date(), aprovadoPor: usuarioId } });
  if (r.count === 0) throw new ErroNegocio("Nada a aprovar: as contas já foram aprovadas, pagas ou canceladas.");
  return r.count;
}
