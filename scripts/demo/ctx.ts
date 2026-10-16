/** Contexto compartilhado da carga de demonstração (uma única transação). */
import type { Tx } from "@/lib/db";
import type { FornKey, HospDef, ProcDef } from "./catalogo";
import type { Rnd } from "./util";

export type ProdInfo = { id: string; cod: string; desc: string; custo: number; preco: number; forn: FornKey };
export type UsuarioInfo = { id: string; nome: string };

/** Título a receber gerado por uma NF (para simular as baixas depois). */
export type TituloReceber = { id: string; valor: number; vencimento: Date; nfDia: Date; hospKey: string; convenio: boolean; glosa: boolean };
/** Título a pagar gerado (compra, despesa, imposto...). */
export type TituloPagar = { id: string; valor: number; vencimento: Date; criado: Date; aprovar: boolean; pagar: boolean; forma: "PIX" | "TED" | "BOLETO" };

export type Ctx = {
  tx: Tx;
  /** Instante de início: linhas criadas depois disso e ainda não redatadas são "da etapa corrente". */
  t0: Date;
  hoje: Date;
  rnd: Rnd;
  u: Record<"admin" | "comercial" | "estoque" | "qualidade" | "compras" | "financeiro", UsuarioInfo>;
  prod: Map<string, ProdInfo>;
  forn: Map<string, string>;
  hosp: Map<string, { id: string; def: HospDef }>;
  med: Map<string, string>;
  conv: Map<string, string>;
  rep: Map<string, string>;
  proc: Map<string, { id: string; def: ProcDef }>;
  centro: Map<string, string>;
  plano: Map<string, string>; // código do plano ("4.02") -> id
  contaId: string; // Itaú
  caixaId: string;
  /** Lotes que o FEFO da demonstração não consome (vencendo, vencido, quarentena, recolhimento...). */
  especiais: Set<string>;
  receber: TituloReceber[];
  pagar: TituloPagar[];
  /** Lançamentos da conta Itaú, para montar o extrato. */
  lancItau: { id: string; data: Date; sentido: "ENTRADA" | "SAIDA"; valor: number; descricao: string }[];
  notaFiscal: number;
  contagem: Record<string, number>;
};

export const conta = (c: Ctx, k: string, n = 1) => {
  c.contagem[k] = (c.contagem[k] ?? 0) + n;
};

/** Datas das linhas de movimento criadas na etapa corrente (kardex em ordem cronológica coerente). */
export async function redatarMovs(c: Ctx, base: Date, passoMs = 60_000) {
  const ms = await c.tx.movimento.findMany({ where: { criadoEm: { gte: c.t0 } }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }], select: { id: true } });
  let i = 0;
  for (const m of ms) await c.tx.movimento.update({ where: { id: m.id }, data: { criadoEm: new Date(base.getTime() + i++ * passoMs) } });
}
