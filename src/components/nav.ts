import type { Perfil } from "@/generated/prisma/client";

export type NavItem = {
  href: string;
  label: string;
  /** restringe só este item (além do grupo); ADMIN vê tudo */
  perfis?: Perfil[];
  /** esta tela é uma ABA do item `abaDe` (href do item pai, no mesmo módulo e com os mesmos perfis). Some do menu quando o módulo está em `MODULOS_COM_ABAS`. */
  abaDe?: string;
  /** rótulo na barra de abas (por padrão, o rótulo do item) */
  aba?: string;
};
export type NavGroup = {
  label: string;
  perfis?: Perfil[];
  items: NavItem[];
  /** aba de módulo na barra superior; por padrão o próprio rótulo do grupo */
  modulo?: string;
  /** fica fora do menu principal (lateral e topo); as rotas continuam valendo para busca, trilha e abas. Ex.: Administração, que vive no menu do usuário. */
  noMenuPrincipal?: boolean;
};

/**
 * Módulos cujas telas-aba já mostram a barra `<AbasNav atual="..." />` no topo (src/components/abas-nav.tsx).
 * Só nestes módulos os itens com `abaDe` saem do menu; nos demais continuam visíveis até a página ganhar a barra de abas
 * (nada fica sem caminho). Para ativar um módulo: ponha `<AbasNav />` nas páginas dele e inclua o nome aqui.
 */
export const MODULOS_COM_ABAS = new Set<string>(["Financeiro"]);

/**
 * Tira do menu os itens que são aba de outro item (só nos módulos de `MODULOS_COM_ABAS` e só se o item pai está na lista,
 * isto é, o perfil enxerga o pai). Use na lista já filtrada por perfil; a busca global e o item ativo usam a lista inteira.
 */
export function esconderAbas(groups: NavGroup[]): NavGroup[] {
  const hrefs = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
  return groups.filter((g) => !g.noMenuPrincipal).map((g) => ({
    ...g,
    items: g.items.filter((i) => !(i.abaDe && MODULOS_COM_ABAS.has(g.modulo ?? g.label) && hrefs.has(i.abaDe))),
  }));
}

/**
 * Menu principal, na ordem e com os nomes de módulo do VS|OPME (VIMAN): Qualidade, Comercial, Compras, Estoque,
 * Faturamento, Financeiro. Antes do VS|OPME ficam o Painel; depois dele, o que o sistema tem a mais (Relatórios,
 * Cadastros, Administração). Veja docs/MENU-REFERENCIA.md. Um grupo por módulo; quem vê cada item é `perfis` do item
 * (ADMIN vê tudo) e o grupo guarda a união, para o módulo só aparecer a quem enxerga ao menos um item.
 */
export const NAV: NavGroup[] = [
  { label: "Geral", modulo: "Painel", items: [{ href: "/", label: "Painel" }] },
  {
    label: "Qualidade",
    perfis: ["QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"],
    items: [
      { href: "/qualidade/rastreabilidade", label: "Rastreabilidade", perfis: ["QUALIDADE", "ESTOQUE"] },
      { href: "/qualidade/lotes", label: "Lotes e validades", perfis: ["QUALIDADE", "ESTOQUE"] },
      { href: "/qualidade/registros", label: "Registros ANVISA", perfis: ["QUALIDADE", "ESTOQUE"], abaDe: "/qualidade/lotes" },
      { href: "/qualidade/quarentena", label: "Quarentena e inspeção", perfis: ["QUALIDADE", "ESTOQUE"] },
      // ação de campo: Qualidade e Estoque operam; o Comercial só consulta (sem dados de paciente)
      { href: "/qualidade/recolhimentos", label: "Recolhimentos", perfis: ["QUALIDADE", "ESTOQUE", "COMERCIAL"] },
      { href: "/qualidade/documentos", label: "Documentos e licenças", perfis: ["QUALIDADE", "ESTOQUE", "COMPRAS", "COMERCIAL"] },
    ],
  },
  {
    label: "Comercial",
    perfis: ["COMERCIAL", "FINANCEIRO"],
    items: [
      { href: "/comercial/cirurgias", label: "Cirurgias", aba: "Cirurgias" },
      { href: "/comercial/agenda", label: "Agenda cirúrgica", abaDe: "/comercial/cirurgias" },
      { href: "/comercial/tabelas-preco", label: "Tabelas de preço" },
      { href: "/comercial/orcamentos", label: "Orçamentos" },
      { href: "/comercial/pedidos", label: "Pedidos de venda" },
      { href: "/comercial/comissoes", label: "Comissões e margem" },
    ],
  },
  {
    label: "Compras",
    perfis: ["COMPRAS", "ESTOQUE"],
    items: [
      { href: "/compras/pedidos", label: "Pedidos de compra", aba: "Pedidos e importações" },
      { href: "/compras/sugestao", label: "Sugestão de compra", abaDe: "/compras/pedidos" },
    ],
  },
  {
    label: "Estoque",
    // o Financeiro só consulta o inventário consignado (valor a cobrar); o resto é do Estoque, com leitura para Comercial e Qualidade
    perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE", "FINANCEIRO"],
    items: [
      { href: "/estoque/remessas", label: "Vales e remessas", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/kits", label: "Caixas de materiais", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/saldos", label: "Saldos e kardex", aba: "Saldos por local", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"] },
      { href: "/estoque/kardex", label: "Kardex", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"], abaDe: "/estoque/saldos" },
      { href: "/estoque/ajustes", label: "Ajustes e perdas", perfis: ["ESTOQUE", "COMERCIAL", "QUALIDADE"], abaDe: "/estoque/saldos" },
      { href: "/estoque/inventario", label: "Inventário consignado" },
    ],
  },
  {
    // emissão de NF-e (agente de NF-e); a escrita fiscal (EFD, livros) seria o módulo "Fiscal/Contábil" do VS|OPME, ainda inexistente
    label: "Faturamento",
    perfis: ["FINANCEIRO", "COMERCIAL"],
    items: [
      { href: "/fiscal/notas", label: "Notas fiscais (NF-e)", aba: "Notas emitidas" },
      { href: "/fiscal/emitir", label: "Emitir NF-e", abaDe: "/fiscal/notas" },
    ],
  },
  {
    label: "Financeiro",
    perfis: ["FINANCEIRO"],
    items: [
      { href: "/financeiro", label: "Visão geral" },
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/aprovacoes", label: "Aprovar contas a pagar", abaDe: "/financeiro/pagar", aba: "Aprovações" },
      { href: "/financeiro/remessas", label: "Pagamentos SISPAG", abaDe: "/financeiro/pagar" },
      { href: "/financeiro/favorecidos", label: "Favorecidos", abaDe: "/financeiro/pagar" },
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/cobranca", label: "Cobrança dos hospitais", abaDe: "/financeiro/receber" },
      { href: "/financeiro/contas", label: "Controle de caixa", aba: "Contas bancárias" },
      { href: "/financeiro/conciliacao", label: "Conciliação", abaDe: "/financeiro/contas" },
      { href: "/financeiro/fluxo", label: "Fluxo de caixa" },
      { href: "/financeiro/dre", label: "Custo gerencial", aba: "DRE gerencial" },
      { href: "/financeiro/plano-contas", label: "Plano de contas", abaDe: "/financeiro/dre" },
      { href: "/financeiro/classificar", label: "Classificar pendentes", abaDe: "/financeiro/dre" },
      { href: "/financeiro/fechamento", label: "Fechamento de mês", abaDe: "/financeiro/dre" },
      { href: "/financeiro/relatorios", label: "Relatórios financeiros" },
    ],
  },
  {
    // o VS|OPME põe "Relatórios" dentro de cada módulo e vende o BI à parte (VS|ANALYTICS); aqui ficam reunidos
    label: "Relatórios",
    perfis: ["COMERCIAL", "ESTOQUE", "COMPRAS", "FINANCEIRO"],
    items: [
      { href: "/gestao/vendas", label: "Vendas e margem", aba: "Vendas por mês" },
      { href: "/gestao/linhas", label: "Vendas por linha", abaDe: "/gestao/vendas" },
      { href: "/gestao/margem", label: "Margem", abaDe: "/gestao/vendas" },
      { href: "/gestao/abc", label: "Curva ABC e giro", aba: "Curva ABC" },
      { href: "/gestao/giro", label: "Giro e cobertura", abaDe: "/gestao/abc" },
      { href: "/gestao/vencimentos", label: "Vencimentos", abaDe: "/gestao/abc" },
      { href: "/gestao/glosas", label: "Glosas", perfis: ["COMERCIAL", "FINANCEIRO"] },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/cadastros/produtos", label: "Produtos" },
      { href: "/cadastros/linhas", label: "Linhas de produto", abaDe: "/cadastros/produtos" },
      { href: "/cadastros/fabricantes", label: "Fabricantes", abaDe: "/cadastros/produtos" },
      { href: "/cadastros/fornecedores", label: "Fornecedores" },
      { href: "/cadastros/hospitais", label: "Hospitais" },
      { href: "/cadastros/convenios", label: "Convênios", abaDe: "/cadastros/hospitais" },
      { href: "/cadastros/medicos", label: "Médicos" },
      { href: "/cadastros/procedimentos", label: "Procedimentos", abaDe: "/cadastros/medicos" },
      { href: "/cadastros/representantes", label: "Representantes" },
    ],
  },
  {
    label: "Administração",
    modulo: "Administração",
    perfis: [],
    noMenuPrincipal: true, // fica no menu do usuário (avatar), não na barra lateral
    items: [
      { href: "/admin/usuarios", label: "Usuários" },
      { href: "/admin/auditoria", label: "Log de auditoria" },
    ],
  },
];
