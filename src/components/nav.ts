import type { Perfil } from "@/generated/prisma/client";

export type NavItem = { href: string; label: string; /** restringe só este item (além do grupo); ADMIN vê tudo */ perfis?: Perfil[] };
export type NavGroup = { label: string; perfis?: Perfil[]; items: NavItem[]; /** aba de módulo na barra superior; por padrão o próprio rótulo do grupo */ modulo?: string };

/** Menu principal. `perfis` restringe a exibição (ADMIN vê tudo). */
export const NAV: NavGroup[] = [
  { label: "Geral", modulo: "Painel", items: [{ href: "/", label: "Painel" }] },
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
    // o Financeiro só consulta o inventário consignado (valor a cobrar); o resto é do Estoque, com leitura para Comercial e Qualidade
    perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE", "FINANCEIRO"],
    items: [
      { href: "/estoque/saldos", label: "Saldos por local", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/remessas", label: "Remessas / vales", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/kits", label: "Caixas e kits", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/kardex", label: "Kardex", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/ajustes", label: "Ajustes e perdas", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/inventario", label: "Inventário consignado" },
    ],
  },
  {
    label: "Qualidade",
    perfis: ["QUALIDADE", "ESTOQUE"],
    items: [
      { href: "/qualidade/quarentena", label: "Quarentena e inspeção" },
      { href: "/qualidade/lotes", label: "Lotes e validades" },
      { href: "/qualidade/rastreabilidade", label: "Rastreabilidade" },
      { href: "/qualidade/registros", label: "Registros ANVISA" },
    ],
  },
  {
    // Qualidade e Estoque operam; o Comercial só consulta (sem dados de paciente)
    label: "Ação de campo",
    modulo: "Qualidade",
    perfis: ["QUALIDADE", "ESTOQUE", "COMERCIAL"],
    items: [{ href: "/qualidade/recolhimentos", label: "Recolhimentos" }],
  },
  {
    label: "Conformidade",
    modulo: "Qualidade",
    perfis: ["QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"],
    items: [{ href: "/qualidade/documentos", label: "Documentos e licenças" }],
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
    modulo: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro", label: "Visão geral" },
      { href: "/financeiro/fluxo", label: "Fluxo de caixa" },
    ],
  },
  {
    label: "Receber",
    modulo: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/cobranca", label: "Cobrança dos hospitais" },
    ],
  },
  {
    label: "Pagar",
    modulo: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/aprovacoes", label: "Aprovar contas a pagar" },
      { href: "/financeiro/remessas", label: "Pagamentos SISPAG" },
      { href: "/financeiro/favorecidos", label: "Favorecidos" },
    ],
  },
  {
    label: "Banco",
    modulo: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro/contas", label: "Contas bancárias" },
      { href: "/financeiro/conciliacao", label: "Conciliação" },
    ],
  },
  {
    label: "Resultado",
    modulo: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro/dre", label: "DRE gerencial" },
      { href: "/financeiro/relatorios", label: "Relatórios" },
      { href: "/financeiro/classificar", label: "Classificar pendentes" },
      { href: "/financeiro/plano-contas", label: "Plano de contas" },
      { href: "/financeiro/fechamento", label: "Fechamento de mês" },
    ],
  },
  {
    label: "Gestão",
    modulo: "Gestão",
    perfis: ["COMERCIAL", "ESTOQUE", "COMPRAS", "FINANCEIRO"],
    items: [
      { href: "/gestao/abc", label: "Curva ABC" },
      { href: "/gestao/giro", label: "Giro e cobertura" },
      { href: "/gestao/margem", label: "Margem" },
      { href: "/gestao/vencimentos", label: "Vencimentos" },
      { href: "/gestao/vendas", label: "Vendas por mês" },
      { href: "/gestao/glosas", label: "Glosas", perfis: ["COMERCIAL", "FINANCEIRO"] },
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
    modulo: "Administração",
    perfis: [],
    items: [
      { href: "/admin/usuarios", label: "Usuários" },
      { href: "/admin/auditoria", label: "Log de auditoria" },
    ],
  },
];
