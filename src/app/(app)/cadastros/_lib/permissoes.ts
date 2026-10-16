import type { Perfil } from "@/generated/prisma/client";

/** Preço base muda margem e faturamento: só o comercial (e o admin). */
export const podeAlterarPreco = (p: Perfil) => p === "COMERCIAL" || p === "ADMIN";

/** Links só-leitura para os módulos donos (o cadastro não repete a regra do módulo: espelha quem enxerga a tela de destino). */
export const podeIrParaDocumentos = (p: Perfil) => ["ADMIN", "QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"].includes(p);
export const podeIrParaCirurgias = (p: Perfil) => ["ADMIN", "COMERCIAL", "FINANCEIRO"].includes(p);
export const podeIrParaSaldos = (p: Perfil) => ["ADMIN", "ESTOQUE", "COMERCIAL", "QUALIDADE"].includes(p);
export const podeIrParaReceber = (p: Perfil) => ["ADMIN", "FINANCEIRO"].includes(p);
export const podeIrParaFavorecidos = (p: Perfil) => ["ADMIN", "FINANCEIRO"].includes(p);
