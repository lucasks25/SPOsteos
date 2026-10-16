import type { SVGProps } from "react";

/** Ícones de traço (24x24, stroke 1.75), um só estilo para todo o sistema. */
const P: Record<string, string> = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  atividade: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  etiqueta: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  percentual: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  pacote: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  caminhao: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  camadas: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  frasco: '<path d="M10 2v7.5L4 20a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9.5V2M8.5 2h7"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  carrinho: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  banco: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3L3 9h18z"/>',
  receber: '<path d="M17 7L7 17M7 7v10h10"/>',
  pagar: '<path d="M7 17L17 7M7 7h10v10"/>',
  tendencia: '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
  grafico: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>',
  conciliar: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  usuarios: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  predio: '<path d="M3 21h18M6 21V4h12v17M10 8h1M14 8h1M10 12h1M14 12h1M10 16h4"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  caixa: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  fechar: '<path d="M18 6L6 18M6 6l12 12"/>',
  seta: '<path d="M6 9l6 6 6-6"/>',
  direita: '<path d="M9 6l6 6-6 6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  ok: '<path d="M20 6L9 17l-5-5"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  impressora: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  filtro: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  medico: '<path d="M6 3v6a6 6 0 0 0 12 0V3M12 15v3a3 3 0 0 0 6 0v-1"/><circle cx="18" cy="14" r="2"/>',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: P[name] ?? P.caixa }}
      {...rest}
    />
  );
}

/** Ícone de cada item do menu (por href) e de cada grupo (por rótulo). */
export const ICONE_ITEM: Record<string, IconName> = {
  "/": "painel",
  "/comercial/cirurgias": "atividade",
  "/comercial/agenda": "calendario",
  "/comercial/orcamentos": "documento",
  "/comercial/pedidos": "carrinho",
  "/comercial/tabelas-preco": "etiqueta",
  "/comercial/comissoes": "percentual",
  "/estoque/saldos": "pacote",
  "/estoque/remessas": "caminhao",
  "/estoque/kits": "camadas",
  "/estoque/kardex": "lista",
  "/estoque/ajustes": "ajustes",
  "/qualidade/quarentena": "frasco",
  "/qualidade/lotes": "pacote",
  "/qualidade/rastreabilidade": "busca",
  "/qualidade/registros": "livro",
  "/qualidade/documentos": "escudo",
  "/compras/pedidos": "carrinho",
  "/compras/sugestao": "tendencia",
  "/financeiro": "painel",
  "/financeiro/fluxo": "tendencia",
  "/financeiro/receber": "receber",
  "/financeiro/cobranca": "documento",
  "/financeiro/pagar": "pagar",
  "/financeiro/aprovacoes": "escudo",
  "/financeiro/remessas": "caminhao",
  "/financeiro/contas": "banco",
  "/financeiro/conciliacao": "conciliar",
  "/financeiro/dre": "grafico",
  "/financeiro/relatorios": "lista",
  "/financeiro/classificar": "etiqueta",
  "/financeiro/plano-contas": "livro",
  "/financeiro/fechamento": "cadeado",
  "/gestao/abc": "grafico",
  "/gestao/giro": "pacote",
  "/gestao/margem": "percentual",
  "/gestao/vencimentos": "frasco",
  "/gestao/vendas": "tendencia",
  "/cadastros/produtos": "pacote",
  "/cadastros/fabricantes": "predio",
  "/cadastros/fornecedores": "caminhao",
  "/cadastros/hospitais": "predio",
  "/cadastros/medicos": "medico",
  "/cadastros/convenios": "escudo",
  "/cadastros/procedimentos": "atividade",
  "/cadastros/representantes": "usuarios",
  "/admin/usuarios": "usuarios",
  "/admin/auditoria": "lista",
};
