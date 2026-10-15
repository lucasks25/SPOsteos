import Link from "next/link";
import type { ReactNode } from "react";
import { Card, PageHeader, Table, Td, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money, num } from "@/lib/format";
import { hojeUTC } from "./_lib/datas";
import { painelFinanceiro, type Faixas } from "./_lib/painel";

type Tom = "default" | "warn" | "danger";

function Tile({ href, label, value, hint, tone = "default" }: { href: string; label: string; value: ReactNode; hint?: ReactNode; tone?: Tom }) {
  return (
    <Link href={href} className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors duration-150 hover:border-teal-600 hover:bg-teal-50/30">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx("tnum mt-1 text-2xl font-semibold tracking-tight", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Link>
  );
}

function Faixas({ titulo, href, f, cor }: { titulo: string; href: string; f: Faixas; cor: "emerald" | "rose" }) {
  const linhas: [string, { valor: number; qtd: number }, string?][] = [
    ["Vencido", f.vencido, f.vencido.qtd ? "text-rose-700" : undefined],
    ["Vence hoje", f.hoje],
    ["Próximos 7 dias", f.ate7],
    ["8 a 30 dias", f.ate30],
    ["Depois de 30 dias", f.depois],
  ];
  return (
    <Card
      title={titulo}
      actions={
        <Link href={href} className="text-xs text-teal-700 hover:underline">
          ver todos
        </Link>
      }
    >
      <div className={cx("mb-3 text-2xl font-semibold", cor === "emerald" ? "text-emerald-700" : "text-rose-700")}>
        {money(f.total.valor)} <span className="text-sm font-normal text-slate-500">em aberto ({f.total.qtd})</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        {linhas.map(([nome, v, classe]) => (
          <div key={nome} className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">{nome}</dt>
            <dd className={cx("tabular-nums", classe)}>
              {money(v.valor)} <span className="text-xs text-slate-400">({v.qtd})</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default async function PainelFinanceiroPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const p = await painelFinanceiro(hoje);
  const pend = p.pendencias;

  return (
    <>
      <PageHeader title="Financeiro" subtitle={`Visão geral em ${date(hoje)}. Valores em aberto já descontam baixas parciais.`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile href="/financeiro/contas" label="Saldo nas contas" value={money(p.saldoTotal)} tone={p.saldoTotal < 0 ? "danger" : "default"} hint={`${p.contas.length} conta(s) ativa(s)`} />
        <Tile
          href="/financeiro/fluxo"
          label="Projeção em 30 dias"
          value={money(p.projecao30)}
          tone={p.projecao30 < 0 ? "danger" : "default"}
          hint="saldo + a receber − a pagar (inclui atrasados)"
        />
        <Tile href="/financeiro/contas" label="Entradas no mês" value={money(p.mes.entradas)} hint="dinheiro que entrou nas contas" />
        <Tile href="/financeiro/contas" label="Saídas no mês" value={money(p.mes.saidas)} hint={`resultado de caixa ${money(p.mes.resultado)}`} tone={p.mes.resultado < 0 ? "warn" : "default"} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Faixas titulo="A receber" href="/financeiro/receber" f={p.receber} cor="emerald" />
        <Faixas titulo="A pagar" href="/financeiro/pagar" f={p.pagar} cor="rose" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile href="/financeiro/conciliacao" label="Extrato a conciliar" value={num(pend.extrato)} tone={pend.extrato ? "warn" : "default"} hint="linhas importadas sem vínculo" />
        <Tile href="/financeiro/conciliacao" label="Baixas sem extrato" value={num(pend.semExtrato)} hint="ainda não vistas no banco (contas bancárias)" />
        <Tile href="/financeiro/remessas" label="Pagamentos aguardando banco" value={num(pend.remessaAguardando)} tone={pend.remessaAguardando ? "warn" : "default"} hint="remessas SISPAG sem retorno ou agendadas" />
        <Tile href="/financeiro/remessas" label="Pagamentos rejeitados" value={num(pend.remessaRejeitada)} tone={pend.remessaRejeitada ? "danger" : "default"} hint="o banco recusou; corrigir e reenviar" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Maiores valores vencidos a receber, por hospital</h2>
          <Table head={["Hospital", "Vencido", "Títulos", "Atraso máx."]} empty={p.inadimplentes.length === 0}>
            {p.inadimplentes.map((h) => (
              <tr key={h.id}>
                <Td className="max-w-[14rem] truncate">
                  {h.id === "sem" ? (
                    h.nome
                  ) : (
                    <Link href={`/financeiro/receber?hospital=${h.id}&vencidos=1`} className="text-teal-700 hover:underline">
                      {h.nome}
                    </Link>
                  )}
                </Td>
                <Td className="text-right tabular-nums text-rose-700">{money(h.valor)}</Td>
                <Td>{h.qtd}</Td>
                <Td>{h.diasAtraso} dia(s)</Td>
              </tr>
            ))}
          </Table>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">A pagar: atrasados e próximos 15 dias</h2>
          <Table head={["Vencimento", "Descrição", "Fornecedor", "A pagar"]} empty={p.proximosPagar.length === 0}>
            {p.proximosPagar.map((t) => (
              <tr key={t.id}>
                <Td className={t.vencimento < hoje ? "text-rose-700" : undefined}>{date(t.vencimento)}</Td>
                <Td className="max-w-[12rem] truncate">
                  <Link href={`/financeiro/pagar/${t.id}`} className="text-teal-700 hover:underline">
                    {t.descricao}
                  </Link>
                </Td>
                <Td className="max-w-[10rem] truncate">{t.fornecedor ?? "—"}</Td>
                <Td className="text-right tabular-nums">{money(t.saldo)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </>
  );
}
