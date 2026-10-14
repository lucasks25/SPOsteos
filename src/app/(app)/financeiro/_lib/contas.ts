import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";

export type ContaRow = {
  id: string;
  nome: string;
  tipo: "BANCO" | "CAIXA";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  titularCnpj: string | null;
  titularNome: string | null;
  ativo: boolean;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

/** Contas com saldo = saldo inicial + entradas - saídas (lançamentos). */
export async function listarContas(incluirInativas = true): Promise<ContaRow[]> {
  const [contas, somas] = await Promise.all([
    db.contaBancaria.findMany({ where: incluirInativas ? {} : { ativo: true }, orderBy: [{ ativo: "desc" }, { nome: "asc" }] }),
    db.lancamento.groupBy({ by: ["contaId", "sentido"], _sum: { valor: true } }),
  ]);
  return contas.map((c) => {
    const soma = (s: "ENTRADA" | "SAIDA") => toNumber(somas.find((x) => x.contaId === c.id && x.sentido === s)?._sum.valor);
    const entradas = soma("ENTRADA");
    const saidas = soma("SAIDA");
    const saldoInicial = toNumber(c.saldoInicial);
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      banco: c.banco,
      agencia: c.agencia,
      numero: c.numero,
      titularCnpj: c.titularCnpj,
      titularNome: c.titularNome,
      ativo: c.ativo,
      saldoInicial,
      entradas,
      saidas,
      saldo: Math.round((saldoInicial + entradas - saidas) * 100) / 100,
    };
  });
}

/** Opções para selects (somente contas ativas, mais a já usada, se informada). */
export async function opcoesContas(incluirId?: string | null): Promise<{ value: string; label: string }[]> {
  const contas = await db.contaBancaria.findMany({
    where: { OR: [{ ativo: true }, ...(incluirId ? [{ id: incluirId }] : [])] },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return contas.map((c) => ({ value: c.id, label: c.nome }));
}
