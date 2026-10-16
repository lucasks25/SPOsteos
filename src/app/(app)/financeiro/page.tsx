import Link from "next/link";
import type { ReactNode } from "react";
import { Card, KpiGrid, btn, PageHeader, Stat, Table, Td, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money, num } from "@/lib/format";
import { Celula, VerTudo } from "@/components/lista";
import { hojeUTC } from "@/lib/datas";
import { painelFinanceiro, type Faixas } from "./_lib/painel";
import { inventariosACobrar } from "./_lib/leitura-painel";

type Tom = "default" | "warn" | "danger";

function Tile({ href, label, value, hint, tone = "default" }: { href: string; label: string; value: ReactNode; hint?: ReactNode; tone?: Tom }) {
  return (
    <Link href={href} className="block rounded outline-offset-2 transition-colors duration-150 hover:[&>div]:border-teal-600">
      <Stat label={label} value={value} hint={hint} tone={tone} />
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
    <Card title={titulo} icon={cor === "emerald" ? "receber" : "pagar"}>
      <div className={cx("tnum mb-3 text-2xl font-bold", cor === "emerald" ? "text-emerald-700" : "text-rose-700")}>
        {money(f.total.valor)} <span className="text-sm font-normal text-slate-500">em aberto ({f.total.qtd})</span>
      </div>
      <dl className="divide-y divide-slate-100 text-[13px] [&>div]:py-1.5">
        {linhas.map(([nome, v, classe]) => (
          <div key={nome} className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">{nome}</dt>
            <dd className={cx("tnum", classe)}>
              {money(v.valor)} <span className="text-xs text-slate-500">({v.qtd})</span>
            </dd>
          </div>
        ))}
      </dl>
      <VerTudo href={href} />
    </Card>
  );
}

export default async function PainelFinanceiroPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const [p, inv] = await Promise.all([painelFinanceiro(hoje), inventariosACobrar()]);
  const pend = p.pendencias;

  return (
    <>
      <PageHeader title="Visão geral" subtitle={`Resumo do caixa, dos títulos e das pendências do Financeiro em ${date(hoje)}; os valores em aberto já descontam baixas parciais.`} />

      <KpiGrid>
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
      </KpiGrid>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Faixas titulo="A receber" href="/financeiro/receber" f={p.receber} cor="emerald" />
        <Faixas titulo="A pagar" href="/financeiro/pagar" f={p.pagar} cor="rose" />
      </div>

      <KpiGrid>
        <Tile href="/financeiro/conciliacao" label="Extrato a conciliar" value={num(pend.extrato)} tone={pend.extrato ? "warn" : "default"} hint="linhas importadas sem vínculo" />
        <Tile href="/financeiro/conciliacao" label="Baixas sem extrato" value={num(pend.semExtrato)} hint="ainda não vistas no banco (contas bancárias)" />
        <Tile href="/financeiro/remessas" label="Pagamentos em remessa sem retorno" value={num(pend.remessaAguardando)} tone={pend.remessaAguardando ? "warn" : "default"} hint="itens de remessas SISPAG enviados ou agendados, sem confirmação do banco" />
        <Tile href="/financeiro/remessas" label="Pagamentos rejeitados em remessa" value={num(pend.remessaRejeitada)} tone={pend.remessaRejeitada ? "danger" : "default"} hint="o banco recusou; corrigir e reenviar" />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table
          titulo="Maiores valores vencidos a receber"
          icone="alerta"
          contagem={p.inadimplentes.length}
          head={["Hospital", "Vencido", "Atraso máx."]}
          empty={p.inadimplentes.length === 0}
          emptyText="Nenhum hospital com valor vencido. Tudo em dia."
          acoes={<Link href="/financeiro/receber?vencidos=1" className={btn.small}>Ver tudo</Link>}
        >
          {p.inadimplentes.map((h) => (
            <tr key={h.id}>
              <Td className="max-w-[16rem]">
                <Celula href={h.id === "sem" ? undefined : `/financeiro/receber?hospital=${h.id}&vencidos=1`} principal={h.nome} sub={`${h.qtd} título(s)`} />
              </Td>
              <Td className="text-right tnum font-medium text-rose-600">{money(h.valor)}</Td>
              <Td className="text-right tnum">{h.diasAtraso} dia(s)</Td>
            </tr>
          ))}
        </Table>
        <Table
          titulo="A pagar: atrasados e próximos 15 dias"
          icone="pagar"
          contagem={p.proximosPagar.length}
          head={["Vencimento", "Descrição", "A pagar"]}
          empty={p.proximosPagar.length === 0}
          emptyText="Nada a pagar atrasado nem nos próximos 15 dias."
          acoes={<Link href="/financeiro/pagar" className={btn.small}>Ver tudo</Link>}
        >
          {p.proximosPagar.map((t) => (
            <tr key={t.id}>
              <Td className={t.vencimento < hoje ? "font-medium text-rose-600" : undefined}>{date(t.vencimento)}</Td>
              <Td className="max-w-[16rem]">
                <Celula href={`/financeiro/pagar/${t.id}`} principal={t.descricao} sub={t.fornecedor ?? "Sem fornecedor"} />
              </Td>
              <Td className="text-right tnum font-medium">{money(t.saldo)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      {inv.qtd > 0 && (
        <div className="mt-4">
          <Table
            titulo={`Inventários com valor a cobrar (${money(inv.total)})`}
            icone="alerta"
            contagem={inv.qtd}
            head={["Inventário", "Hospital", "Fechado em", "A cobrar"]}
            acoes={<Link href="/estoque/inventario?cobrar=1" className={btn.small}>Ver todos</Link>}
          >
            {inv.itens.map((i) => (
              <tr key={i.id}>
                <Td><Celula href={`/estoque/inventario/${i.id}`} principal={`INV-${i.id}`} sub="falta cobrada do hospital" /></Td>
                <Td className="max-w-[16rem]">{i.hospital}</Td>
                <Td>{i.fechadoEm ? date(i.fechadoEm) : "—"}</Td>
                <Td className="text-right tnum font-medium">{money(i.valor)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-1 text-xs text-slate-500">Faltas do inventário de consignado que o estoque marcou para cobrar do hospital. O título não é gerado sozinho: confira e lance a conta a receber com a NF.</p>
        </div>
      )}
    </>
  );
}
