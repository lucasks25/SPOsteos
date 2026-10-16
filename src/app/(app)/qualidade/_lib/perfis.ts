import type { Perfil } from "@/generated/prisma/client";

export function somarDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * 24 * 60 * 60 * 1000);
}

export const PERFIS_QUALIDADE: Perfil[] = ["QUALIDADE", "ESTOQUE"];
