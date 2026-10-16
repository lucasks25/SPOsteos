import Link from "next/link";
import { Card, KpiGrid, btn, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money, num } from "@/lib/format";
import { Celula } from "@/components/lista";
import { hojeUTC } from "@/lib/datas";
import { painelFinanceiro, type Faixas } from "./_lib/painel";
import { inventariosACobrar } from "./_lib/leitura-painel";
import { AgingBarra } from "./_lib/aging-barra";

/** Cartão de aging (ERPNext "Accounts Receivable/Payable"): total em aberto no cabeçalho, barra por faixa e tabela de faixas. */
function Aging({ titulo, href, f }: { titulo: string; href: string; f: Faixas }) {
  return (
    <Card
      title={titulo}
      actions={
        <>
          <span className="tnum text-sm text-slate-600">
            <strong className="font-semibold text-slate-900">{money(f.total.valor)}</strong> em {f.total.qtd} título(s)
          </span>
          <Link href={href} className={btn.small}>
            Ver tudo
          </Link>
        </>
      }
    >
      <AgingBarra
        total={f.total.valor}
        faixas={[
          { rotulo: "Vencido", ...f.vencido, cor: "bg-rose-500", href: `${href}?vencidos=1`, destaque: true },
          { rotulo: "Vence hoje", ...f.hoje, cor: "bg-amber-400" },
          { rotulo: "Próximos 7 dias", ...f.ate7, cor: "bg-teal-600" },
          { rotulo: "8 a 30 dias", ...f.ate30, cor: "bg-teal-300" },
          { rotulo: "Depois de 30 dias", ...f.depois, cor: "bg-slate-300" },
        ]}
      />
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
        <Stat href="/financeiro/contas" label="Saldo nas contas" value={money(p.saldoTotal)} tone={p.saldoTotal < 0 ? "danger" : "default"} hint={`${p.contas.length} conta(s) ativa(s)`} />
        <Stat href="/financeiro/fluxo" label="Projeção em 30 dias" value={money(p.projecao30)} tone={p.projecao30 < 0 ? "danger" : "default"} hint="saldo + a receber − a pagar" />
        <Stat href="/financeiro/contas" label="Entradas no mês" value={money(p.mes.entradas)} hint="recebido nas contas" />
        <Stat href="/financeiro/contas" label="Saídas no mês" value={money(p.mes.saidas)} hint={`resultado ${money(p.mes.resultado)}`} tone={p.mes.resultado < 0 ? "warn" : "default"} />
      </KpiGrid>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Aging titulo="A receber" href="/financeiro/receber" f={p.receber} />
        <Aging titulo="A pagar" href="/financeiro/pagar" f={p.pagar} />
      </div>

      <KpiGrid>
        <Stat href="/financeiro/conciliacao" label="Extrato a conciliar" value={num(pend.extrato)} tone={pend.extrato ? "warn" : "default"} hint="linhas sem vínculo" />
        <Stat href="/financeiro/conciliacao" label="Baixas sem extrato" value={num(pend.semExtrato)} hint="ainda não vistas no banco" />
        <Stat href="/financeiro/remessas" label="Remessa sem retorno" value={num(pend.remessaAguardando)} tone={pend.remessaAguardando ? "warn" : "default"} hint="pagamentos SISPAG aguardando" />
        <Stat href="/financeiro/remessas" label="Rejeitados na remessa" value={num(pend.remessaRejeitada)} tone={pend.remessaRejeitada ? "danger" : "default"} hint="corrigir e reenviar" />
      </KpiGrid>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Table
          titulo="Maiores valores vencidos a receber"
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
          contagem={p.proximosPagar.length}
          head={["Vencimento", "Descrição", "A pagar"]}
          empty={p.proximosPagar.length === 0}
          emptyText="Nada a pagar atrasado nem nos próximos 15 dias."
          acoes={<Link href="/financeiro/pagar" className={btn.small}>Ver tudo</Link>}
        >
          {p.proximosPagar.map((t) => (
            <tr key={t.id}>
              <Td className={t.vencimento < hoje ? "font-medium text-rose-600" : undefined}>{date(t.vencimento)}</Td>
              <Td className="max-w-[18rem]">
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
            titulo="Inventários com falta a cobrar do hospital"
            contagem={inv.qtd}
            head={["Inventário", "Hospital", "Fechado em", "A cobrar"]}
            acoes={<Link href="/estoque/inventario?cobrar=1" className={btn.small}>Ver todos</Link>}
            rodape={
              <tr>
                <td colSpan={3} className="px-4 py-1 text-slate-900">
                  Total <span className="text-xs font-normal text-slate-500">· o título não é gerado sozinho: confira e lance a conta a receber com a NF</span>
                </td>
                <Td className="text-right tnum">{money(inv.total)}</Td>
              </tr>
            }
          >
            {inv.itens.map((i) => (
              <tr key={i.id}>
                <Td><Celula href={`/estoque/inventario/${i.id}`} principal={`INV-${i.id}`} /></Td>
                <Td className="max-w-[16rem]">{i.hospital}</Td>
                <Td>{i.fechadoEm ? date(i.fechadoEm) : "—"}</Td>
                <Td className="text-right tnum font-medium">{money(i.valor)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}
