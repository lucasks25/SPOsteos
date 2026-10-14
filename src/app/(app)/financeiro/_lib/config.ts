/** Configuração dos dois tipos de título (contas a receber / a pagar). */

export type Tipo = "receber" | "pagar";

export const CATEGORIAS_PAGAR = ["Fornecedores", "Impostos", "Folha", "Aluguel", "Logística", "Serviços", "Outros"] as const;

export const STATUS_TITULO = ["ABERTO", "PAGO", "CANCELADO"] as const;

export const FORMAS_PAGAMENTO = [
  { value: "PIX", label: "Pix" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TED", label: "TED / transferência" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OUTRO", label: "Outro" },
] as const;
export const FORMAS = FORMAS_PAGAMENTO.map((f) => f.value);

/** Categorias de lançamentos avulsos (o que aparece no extrato sem título). */
export const CATEGORIAS_AVULSO = ["Tarifa bancária", "Juros / multa", "Rendimento", "Impostos", "Outros"] as const;
export type StatusTitulo = (typeof STATUS_TITULO)[number];

export const TIPOS = {
  receber: {
    titulo: "Contas a receber",
    singular: "Conta a receber",
    entidade: "ContaReceber",
    path: "/financeiro/receber",
    parceiro: "Hospital",
    parceiroParam: "hospital",
    pagoLabel: "Recebido",
    baixaLabel: "Registrar recebimento",
    pedidoHref: (id: number) => `/comercial/pedidos/${id}`,
    pedidoLabel: (id: number) => `Pedido de venda #${id}`,
  },
  pagar: {
    titulo: "Contas a pagar",
    singular: "Conta a pagar",
    entidade: "ContaPagar",
    path: "/financeiro/pagar",
    parceiro: "Fornecedor",
    parceiroParam: "fornecedor",
    pagoLabel: "Pago",
    baixaLabel: "Registrar pagamento",
    pedidoHref: (id: number) => `/compras/pedidos/${id}`,
    pedidoLabel: (id: number) => `Pedido de compra #${id}`,
  },
} as const;

export function isTipo(v: unknown): v is Tipo {
  return v === "receber" || v === "pagar";
}

/** Título normalizado (sem Decimal) usado pelas telas. */
export type TituloRow = {
  id: string;
  descricao: string;
  parceiroId: string | null;
  parceiroNome: string | null;
  pedidoId: number | null;
  categoria: string | null;
  codigoBarras: string | null;
  valor: number;
  vencimento: Date;
  status: StatusTitulo;
  valorPago: number | null; // dinheiro movimentado nas baixas (inclui juros e multa, exclui desconto)
  valorBaixado: number; // Σ(principal + desconto): quanto do título já foi extinto
  saldo: number; // valor - valorBaixado (0 quando quitado ou cancelado)
  pagoEm: Date | null; // última baixa
  criadoEm: Date;
};
