import Link from "next/link";
import { Form, Select } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { classificarLote } from "../_lib/classificar-actions";
import { opcoesClassificacao } from "../_lib/plano";

type Linha = { chave: string; tipo: string; data: Date; descricao: string; parceiro: string; valor: number };
const nome = (p: { razaoSocial: string; nomeFantasia: string | null } | null) => (p ? p.nomeFantasia || p.razaoSocial : "—");

export default async function ClassificarPage() {
  await requireUser(["FINANCEIRO"]);
  const [cr, cp, av, { planos, centros }] = await Promise.all([
    db.contaReceber.findMany({ where: { planoContaId: null, status: { not: "CANCELADO" } }, orderBy: { competencia: "asc" }, take: 300, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.contaPagar.findMany({ where: { planoContaId: null, status: { not: "CANCELADO" } }, orderBy: { competencia: "asc" }, take: 300, include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.lancamento.findMany({ where: { planoContaId: null, contaReceberId: null, contaPagarId: null, transferenciaId: null }, orderBy: { data: "asc" }, take: 300, include: { conta: { select: { nome: true } } } }),
    opcoesClassificacao(db),
  ]);
  const linhas: Linha[] = [
    ...cr.map((t) => ({ chave: `receber:${t.id}`, tipo: "A receber", data: t.competencia, descricao: t.descricao, parceiro: nome(t.hospital), valor: toNumber(t.valor) })),
    ...cp.map((t) => ({ chave: `pagar:${t.id}`, tipo: "A pagar", data: t.competencia, descricao: t.descricao, parceiro: nome(t.fornecedor), valor: -toNumber(t.valor) })),
    ...av.map((l) => ({ chave: `avulso:${l.id}`, tipo: "Avulso", data: l.data, descricao: l.descricao, parceiro: l.conta.nome, valor: l.sentido === "ENTRADA" ? toNumber(l.valor) : -toNumber(l.valor) })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  return (
    <>
      <PageHeader title="Classificar pendentes" subtitle="Títulos e lançamentos avulsos sem conta do plano. Marque os itens, escolha a conta e aplique de uma vez. A data de competência não muda." />
      {linhas.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nada pendente: tudo está classificado. Veja o <Link href="/financeiro/dre" className="text-teal-700 hover:underline">DRE</Link>.
          </p>
        </Card>
      ) : (
        <Form action={classificarLote} submitLabel="Classificar selecionados" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Conta do plano *" name="planoContaId" options={planos} placeholder="Selecione..." required />
            <Select label="Centro de custo (opcional)" name="centroCustoId" options={centros} placeholder="(manter como está)" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Selecionar</span></th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Competência</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Descrição</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Parceiro / conta</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr:hover]:bg-slate-50/70">
                {linhas.map((l) => (
                  <tr key={l.chave}>
                    <td className="px-3 py-2">
                      <input type="checkbox" name="item" value={l.chave} className="h-4 w-4" aria-label={`Selecionar ${l.descricao}`} />
                    </td>
                    <td className="px-3 py-2">{date(l.data)}</td>
                    <td className="px-3 py-2">{l.tipo}</td>
                    <td className="max-w-xs truncate px-3 py-2">{l.descricao}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2">{l.parceiro}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${l.valor < 0 ? "text-rose-700" : ""}`}>{money(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Mostrando até 300 de cada tipo, do mais antigo. Item em mês fechado faz o lote inteiro ser recusado: reabra o mês em Fechamento.</p>
        </Form>
      )}
    </>
  );
}
