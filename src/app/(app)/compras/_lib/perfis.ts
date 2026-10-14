import type { Perfil } from "@/generated/prisma/client";

export const PERFIS_COMPRAS: Perfil[] = ["COMPRAS", "ESTOQUE"];

export const documentoPedido = (id: number) => `PC-${id}`;

/** Início do dia de hoje em UTC (datas de validade são gravadas à meia-noite UTC). */
export function hojeUTC() {
  return new Date(new Date().toISOString().slice(0, 10));
}
