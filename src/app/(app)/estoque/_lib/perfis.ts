import type { Perfil } from "@/generated/prisma/client";

/** Perfis que podem consultar o módulo de estoque (ADMIN sempre pode). */
export const PERFIS_VER: Perfil[] = ["ESTOQUE", "COMERCIAL", "QUALIDADE"];
/** Inventário de consignado: o FINANCEIRO também consulta (só leitura) para saber os valores a cobrar dos hospitais. */
export const PERFIS_VER_INVENTARIO: Perfil[] = [...PERFIS_VER, "FINANCEIRO"];
/** Perfis que podem movimentar estoque, criar remessas, kits e ajustes. */
export const PERFIS_EDITAR: Perfil[] = ["ESTOQUE"];

export const podeEditar = (perfil: Perfil) => perfil === "ADMIN" || PERFIS_EDITAR.includes(perfil);
