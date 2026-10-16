import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { garantirMesAberto } from "./fechamento";

/** Aprova contas a pagar abertas e ainda não aprovadas. Devolve quantas foram aprovadas; recusa se nenhuma pôde ser. */
export async function aprovarContasPagarTx(tx: Tx, ids: string[], usuarioId: string): Promise<number> {
  if (ids.length === 0) throw new ErroNegocio("Selecione ao menos uma conta.");
  if (ids.length > 500) throw new ErroNegocio("Máximo de 500 por vez.");
  const contas = await tx.contaPagar.findMany({ where: { id: { in: ids }, aprovadoEm: null, status: "ABERTO" }, select: { id: true, competencia: true } });
  await garantirMesAberto(tx, contas.map((c) => c.competencia), "aprovar contas dessa competência");
  const r = await tx.contaPagar.updateMany({ where: { id: { in: contas.map((c) => c.id) }, aprovadoEm: null }, data: { aprovadoEm: new Date(), aprovadoPor: usuarioId } });
  if (r.count === 0) throw new ErroNegocio("Nada a aprovar: as contas já foram aprovadas, pagas ou canceladas.");
  return r.count;
}
