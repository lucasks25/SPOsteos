import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";

export type LinhaView = { id: string; data: Date; valor: number; descricao: string; lancamentoId: string | null };
export type OpcaoTitulo = { id: string; label: string; saldo: number };
export type SugestaoLancamento = { id: string; descricao: string; data: Date };

const DIA = 86_400_000;
const JANELA_DIAS = 5;
const cent = (n: number) => Math.round(n * 100);

const nome = (p: { razaoSocial: string; nomeFantasia: string | null } | null) => (p ? p.nomeFantasia || p.razaoSocial : "sem parceiro");

export async function carregarConciliacao(contaId: string) {
  const [pendentes, conciliadas, pendTotal, concTotal, lancamentos, rec, pag, semExtrato] = await Promise.all([
    db.extratoLinha.findMany({ where: { contaId, lancamentoId: null }, orderBy: { data: "asc" }, take: 100 }),
    db.extratoLinha.findMany({ where: { contaId, lancamentoId: { not: null } }, orderBy: { data: "desc" }, take: 30, include: { lancamento: { select: { descricao: true, contaReceberId: true, contaPagarId: true } } } }),
    db.extratoLinha.count({ where: { contaId, lancamentoId: null } }),
    db.extratoLinha.count({ where: { contaId, lancamentoId: { not: null } } }),
    db.lancamento.findMany({ where: { contaId, extrato: null }, orderBy: { data: "desc" }, take: 500, select: { id: true, descricao: true, data: true, valor: true, sentido: true } }),
    db.contaReceber.findMany({ where: { status: "ABERTO" }, orderBy: { vencimento: "asc" }, take: 300, select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.contaPagar.findMany({ where: { status: "ABERTO" }, orderBy: { vencimento: "asc" }, take: 300, select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.lancamento.count({ where: { contaId, extrato: null } }),
  ]);

  const titulos = (rows: { id: string; descricao: string; valor: unknown; valorPago: unknown; vencimento: Date }[], parceiro: (i: number) => string): OpcaoTitulo[] =>
    rows.map((t, i) => {
      const saldo = toNumber(t.valor as string) - toNumber(t.valorPago as string);
      return { id: t.id, saldo: Math.round(saldo * 100) / 100, label: `${t.descricao} — ${parceiro(i)} — venc. ${t.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` };
    });
  const receber = titulos(rec, (i) => nome(rec[i].hospital));
  const pagar = titulos(pag, (i) => nome(pag[i].fornecedor));

  const pend = pendentes.map((l) => {
    const valor = toNumber(l.valor);
    const entrada = valor > 0;
    const sugLanc: SugestaoLancamento[] = lancamentos
      .filter((x) => (x.sentido === "ENTRADA") === entrada && cent(toNumber(x.valor)) === cent(Math.abs(valor)) && Math.abs(x.data.getTime() - l.data.getTime()) <= JANELA_DIAS * DIA)
      .slice(0, 3)
      .map((x) => ({ id: x.id, descricao: x.descricao, data: x.data }));
    const opcoes = entrada ? receber : pagar;
    const exatos = opcoes.filter((t) => cent(t.saldo) === cent(Math.abs(valor)));
    const demais = opcoes.filter((t) => cent(t.saldo) !== cent(Math.abs(valor)));
    return { linha: { id: l.id, data: l.data, valor, descricao: l.descricao, lancamentoId: null } as LinhaView, sugLanc, exatos, titulos: [...exatos, ...demais] };
  });

  return {
    pendentes: pend,
    conciliadas: conciliadas.map((l) => ({
      id: l.id,
      data: l.data,
      valor: toNumber(l.valor),
      descricao: l.descricao,
      vinculo: l.lancamento?.descricao ?? "",
    })),
    pendTotal,
    concTotal,
    semExtrato,
  };
}
