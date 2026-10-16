import type { Perfil } from "@/generated/prisma/client";

/** Dados bancários/Pix de fornecedor decidem para onde o SISPAG paga: só quem paga (e o admin) vê e altera. */
export const podeDadosBancarios = (p: Perfil) => p === "FINANCEIRO" || p === "ADMIN";

/** Preço base muda margem e faturamento: só o comercial (e o admin). */
export const podeAlterarPreco = (p: Perfil) => p === "COMERCIAL" || p === "ADMIN";

/** "…1234": mostra só o final de dado sensível na auditoria. */
export const mascarar = (v: string | null | undefined) => (v ? `…${v.slice(-4)}` : "vazio");

/** Links só-leitura para os módulos donos (o cadastro não repete a regra do módulo: espelha quem enxerga a tela de destino). */
export const podeIrParaDocumentos = (p: Perfil) => ["ADMIN", "QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"].includes(p);
export const podeIrParaCirurgias = (p: Perfil) => ["ADMIN", "COMERCIAL", "FINANCEIRO"].includes(p);
export const podeIrParaSaldos = (p: Perfil) => ["ADMIN", "ESTOQUE", "COMERCIAL", "QUALIDADE"].includes(p);
export const podeIrParaReceber = (p: Perfil) => ["ADMIN", "FINANCEIRO"].includes(p);
