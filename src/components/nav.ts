import type { Perfil } from "@/generated/prisma/client";

export type NavItem = { href: string; label: string };
export type NavGroup = { label: string; perfis?: Perfil[]; items: NavItem[] };

/** Menu principal. `perfis` restringe a exibição (ADMIN vê tudo). */
export const NAV: NavGroup[] = [
  { label: "Geral", items: [{ href: "/", label: "Painel" }] },
  {
    label: "Comercial",
    perfis: ["COMERCIAL", "FINANCEIRO"],
    items: [
      { href: "/comercial/cirurgias", label: "Cirurgias" },
      { href: "/comercial/agenda", label: "Agenda cirúrgica" },
      { href: "/comercial/orcamentos", label: "Orçamentos" },
      { href: "/comercial/pedidos", label: "Pedidos de venda" },
      { href: "/comercial/tabelas-preco", label: "Tabelas de preço" },
      { href: "/comercial/comissoes", label: "Comissões e margem" },
    ],
  },
  {
    label: "Estoque",
    perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"],
    items: [
      { href: "/estoque/saldos", label: "Saldos por local" },
      { href: "/estoque/remessas", label: "Remessas / vales" },
      { href: "/estoque/kits", label: "Caixas e kits" },
      { href: "/estoque/kardex", label: "Kardex" },
      { href: "/estoque/ajustes", label: "Ajustes e perdas" },
    ],
  },
  {
    label: "Qualidade",
    perfis: ["QUALIDADE", "ESTOQUE"],
    items: [
      { href: "/qualidade/quarentena", label: "Quarentena / inspeção" },
      { href: "/qualidade/lotes", label: "Lotes e validades" },
      { href: "/qualidade/rastreabilidade", label: "Rastreabilidade" },
      { href: "/qualidade/registros", label: "Registros ANVISA" },
    ],
  },
  {
    label: "Compras",
    perfis: ["COMPRAS", "ESTOQUE"],
    items: [
      { href: "/compras/pedidos", label: "Pedidos de compra" },
      { href: "/compras/sugestao", label: "Sugestão de compra" },
    ],
  },
  {
    label: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro", label: "Visão geral" },
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/fluxo", label: "Fluxo de caixa" },
      { href: "/financeiro/contas", label: "Contas bancárias" },
      { href: "/financeiro/conciliacao", label: "Conciliação" },
      { href: "/financeiro/remessas", label: "Pagamentos SISPAG" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/cadastros/produtos", label: "Produtos" },
      { href: "/cadastros/fabricantes", label: "Fabricantes" },
      { href: "/cadastros/fornecedores", label: "Fornecedores" },
      { href: "/cadastros/hospitais", label: "Hospitais" },
      { href: "/cadastros/medicos", label: "Médicos" },
      { href: "/cadastros/convenios", label: "Convênios" },
      { href: "/cadastros/procedimentos", label: "Procedimentos" },
      { href: "/cadastros/representantes", label: "Representantes" },
    ],
  },
  {
    label: "Administração",
    perfis: [],
    items: [
      { href: "/admin/usuarios", label: "Usuários" },
      { href: "/admin/auditoria", label: "Log de auditoria" },
    ],
  },
];
