import type { Perfil } from "@/generated/prisma/client";

export type AtalhoNovo = { href: string; label: string; perfis: Perfil[] };

/**
 * Atalhos de criação do menu "+ Novo". `perfis` espelha o requireUser da página/ação correspondente
 * (ADMIN sempre vê tudo).
 */
export const ATALHOS_NOVO: AtalhoNovo[] = [
  { href: "/comercial/cirurgias/nova", label: "Nova cirurgia", perfis: ["COMERCIAL"] },
  { href: "/comercial/orcamentos/novo", label: "Novo orçamento", perfis: ["COMERCIAL"] },
  { href: "/compras/pedidos/novo", label: "Novo pedido de compra", perfis: ["COMPRAS", "ESTOQUE"] },
  { href: "/financeiro/receber/novo", label: "Novo título a receber", perfis: ["FINANCEIRO"] },
  { href: "/financeiro/pagar/novo", label: "Novo título a pagar", perfis: ["FINANCEIRO"] },
  { href: "/cadastros/produtos/novo", label: "Novo produto", perfis: ["COMERCIAL", "ESTOQUE", "QUALIDADE", "COMPRAS"] },
  { href: "/cadastros/hospitais/novo", label: "Novo hospital", perfis: ["COMERCIAL", "FINANCEIRO"] },
  { href: "/estoque/remessas/nova", label: "Nova remessa", perfis: ["ESTOQUE"] },
];

export function atalhosDoPerfil(perfil: string): AtalhoNovo[] {
  const p = perfil.toUpperCase();
  return ATALHOS_NOVO.filter((a) => p === "ADMIN" || (a.perfis as string[]).includes(p));
}
