import type { Perfil } from "@/generated/prisma/client";

/** Início do dia de hoje em UTC (datas de validade são gravadas à meia-noite UTC). */
export function hojeUTC() {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function somarDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * 24 * 60 * 60 * 1000);
}

export const PERFIS_QUALIDADE: Perfil[] = ["QUALIDADE", "ESTOQUE"];
