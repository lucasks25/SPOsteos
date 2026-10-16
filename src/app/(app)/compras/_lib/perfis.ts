import type { Perfil } from "@/generated/prisma/client";

export const PERFIS_COMPRAS: Perfil[] = ["COMPRAS", "ESTOQUE"];

export const documentoPedido = (id: number) => `PC-${id}`;
