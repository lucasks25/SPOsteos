import "server-only";
import { db } from "@/lib/db";

/** Leitura para o painel/sino (só leitura): contas a pagar geradas por outros módulos aguardando aprovação. */
export async function contarAprovacoesPendentes(): Promise<number> {
  return db.contaPagar.count({ where: { aprovadoEm: null, status: "ABERTO" } });
}
