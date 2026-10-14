import type { Perfil } from "@/generated/prisma/client";

/** Perfis que podem consultar o módulo de estoque (ADMIN sempre pode). */
export const PERFIS_VER: Perfil[] = ["ESTOQUE", "COMERCIAL", "QUALIDADE"];
/** Perfis que podem movimentar estoque, criar remessas, kits e ajustes. */
export const PERFIS_EDITAR: Perfil[] = ["ESTOQUE"];

export const podeEditar = (perfil: Perfil) => perfil === "ADMIN" || PERFIS_EDITAR.includes(perfil);
