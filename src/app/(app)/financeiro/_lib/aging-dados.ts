import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import type { Tipo } from "./config";
import { agingPorParceiro, type TituloAberto } from "./aging";

const nome = (p: { razaoSocial: string; nomeFantasia: string | null } | null) => (p ? p.nomeFantasia || p.razaoSocial : "Sem cadastro");

export async function carregarAging(tipo: Tipo, hoje: Date) {
  const sel = { id: true, valor: true, valorBaixado: true, vencimento: true } as const;
  const titulos: TituloAberto[] =
    tipo === "receber"
      ? (await db.contaReceber.findMany({ where: { status: "ABERTO" }, select: { ...sel, hospitalId: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } })).map((t) => ({
          parceiroId: t.hospitalId,
          parceiro: nome(t.hospital),
          saldo: toNumber(t.valor) - toNumber(t.valorBaixado),
          vencimento: t.vencimento,
        }))
      : (await db.contaPagar.findMany({ where: { status: "ABERTO" }, select: { ...sel, fornecedorId: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } })).map((t) => ({
          parceiroId: t.fornecedorId,
          parceiro: nome(t.fornecedor),
          saldo: toNumber(t.valor) - toNumber(t.valorBaixado),
          vencimento: t.vencimento,
        }));
  return agingPorParceiro(titulos, hoje);
}
