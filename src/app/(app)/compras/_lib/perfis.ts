import type { Perfil } from "@/generated/prisma/client";

export const PERFIS_COMPRAS: Perfil[] = ["COMPRAS", "ESTOQUE"];

export const documentoPedido = (id: number) => `PC-${id}`;

/** Dia de hoje em Brasília como meia-noite UTC (datas de validade, vigência e competência são gravadas assim). */
export { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
