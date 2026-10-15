import type { Perfil } from "@/generated/prisma/client";

/** Dia de hoje em Brasília como meia-noite UTC (datas de validade, vigência e competência são gravadas assim). */
export { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";

export function somarDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * 24 * 60 * 60 * 1000);
}

export const PERFIS_QUALIDADE: Perfil[] = ["QUALIDADE", "ESTOQUE"];
