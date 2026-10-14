import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, StatusBadge, Table, Td, cx } from "@/components/ui";
import { dateTime, diasAtras, money, num, toNumber } from "@/lib/format";
import type { Perfil } from "@/generated/prisma/client";

const DIA = 24 * 60 * 60 * 1000;

/** Meia-noite de hoje em Brasília (UTC−3). */
function hojeSP() {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(`${agora.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

function Tile({ href, label, value, hint, tone = "default" }: { href: string; label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "danger" }) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-600 hover:shadow">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold", tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-slate-900")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Link>
  );
}

const ve = (perfil: Perfil, ...perfis: Perfil[]) => perfil === "ADMIN" || perfis.includes(perfil);

export default async function Painel() {
  const user = await requireUser();
  const p = user.perfil;
  const hoje = hojeSP();
  const amanha = new Date(hoje.getTime() + DIA);
  const em7 = new Date(hoje.getTime() + 7 * DIA);
  const em30 = new Date(hoje.getTime() + 30 * DIA);
  const em90 = new Date(hoje.getTime() + 90 * DIA);
  const inicioMes = new Date(`${new Date(hoje.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01T00:00:00-03:00`);
  const seisMeses = diasAtras(186);

  const [
    cirHoje, cir7, aFaturar, vendasMes, recVencidos, pagar7, quarentena, lotesVencendo, produtos, saldosLib, registros, remessasPend, proximas, vendas6m,
  ] = await Promise.all([
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: amanha }, status: { not: "CANCELADA" } } }),
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: em7 }, status: { not: "CANCELADA" } } }),
    db.cirurgia.count({ where: { status: "REALIZADA" } }),
    db.pedidoVenda.aggregate({ where: { status: "FATURADO", faturadoEm: { gte: inicioMes } }, _sum: { total: true, custoTotal: true }, _count: true }),
    db.contaReceber.aggregate({ where: { status: "ABERTO", vencimento: { lt: hoje } }, _sum: { valor: true }, _count: true }),
    db.contaPagar.aggregate({ where: { status: "ABERTO", vencimento: { lt: em7 } }, _sum: { valor: true }, _count: true }),
    db.lote.count({ where: { status: "QUARENTENA", saldos: { some: { quantidade: { gt: 0 } } } } }),
    db.lote.count({ where: { validade: { lt: em30 }, saldos: { some: { quantidade: { gt: 0 } } } } }),
    db.produto.findMany({ where: { ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, estoqueMinimo: true } }),
    db.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: hoje } } }, _sum: { quantidade: true } }),
    db.produto.count({ where: { ativo: true, validadeRegistro: { lt: em90 } } }),
    db.remessa.count({ where: { status: "ENVIADA" } }),
    db.cirurgia.findMany({
      where: { dataHora: { gte: hoje }, status: { in: ["AGENDADA", "CONFIRMADA"] } },
      include: { hospital: true, medico: true, procedimento: true, _count: { select: { remessas: true } } },
      orderBy: { dataHora: "asc" },
      take: 10,
    }),
    db.pedidoVenda.findMany({ where: { status: "FATURADO", faturadoEm: { gte: seisMeses } }, select: { faturadoEm: true, total: true, custoTotal: true } }),
  ]);

  const saldoMap = new Map(saldosLib.map((s) => [s.produtoId, s._sum.quantidade ?? 0]));
  const abaixoMin = produtos.filter((x) => (saldoMap.get(x.id) ?? 0) < x.estoqueMinimo).length;
  const vendidoMes = toNumber(vendasMes._sum.total);
  const margemMes = vendidoMes - toNumber(vendasMes._sum.custoTotal);

  // Vendas dos últimos 6 meses (por mês da NF, horário de Brasília)
  const meses: { chave: string; label: string; total: number; margem: number }[] = [];
  const base = new Date(hoje.getTime() + 3 * 60 * 60 * 1000);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    meses.push({ chave: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""), total: 0, margem: 0 });
  }
  for (const v of vendas6m) {
    if (!v.faturadoEm) continue;
    const chave = new Date(v.faturadoEm.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const m = meses.find((x) => x.chave === chave);
    if (m) {
      m.total += toNumber(v.total);
      m.margem += toNumber(v.total) - toNumber(v.custoTotal);
    }
  }
  const maxVenda = Math.max(1, ...meses.map((m) => m.total));

  const comercial = ve(p, "COMERCIAL", "FINANCEIRO");
  const financeiro = ve(p, "FINANCEIRO");
  const estoque = ve(p, "ESTOQUE", "QUALIDADE", "COMPRAS", "COMERCIAL");

  return (
    <>
      <PageHeader title={`Olá, ${user.nome.split(" ")[0]}`} subtitle="Painel geral — clique em um indicador para ver os detalhes" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {comercial && (
          <>
            <Tile href="/comercial/agenda" label="Cirurgias hoje" value={num(cirHoje)} hint={`${num(cir7)} nos próximos 7 dias`} />
            <Tile href="/comercial/cirurgias?status=REALIZADA" label="Cirurgias a faturar" value={num(aFaturar)} tone={aFaturar ? "warn" : "default"} hint="realizadas sem pedido de venda" />
            <Tile href="/comercial/comissoes" label="Vendas no mês" value={money(vendidoMes)} hint={`margem ${money(margemMes)}${vendidoMes ? ` (${((margemMes / vendidoMes) * 100).toFixed(1)}%)` : ""} · ${vendasMes._count} NF`} />
          </>
        )}
        {financeiro && (
          <>
            <Tile href="/financeiro/receber?vencidos=1" label="A receber vencido" value={money(recVencidos._sum.valor)} tone={recVencidos._count ? "danger" : "default"} hint={`${recVencidos._count} título(s)`} />
            <Tile href="/financeiro/pagar" label="A pagar em 7 dias" value={money(pagar7._sum.valor)} tone={pagar7._count ? "warn" : "default"} hint={`${pagar7._count} título(s), incluindo atrasados`} />
          </>
        )}
        {estoque && (
          <>
            <Tile href="/estoque/remessas?status=ENVIADA" label="Remessas a conferir" value={num(remessasPend)} tone={remessasPend ? "warn" : "default"} hint="vales enviados aos hospitais" />
            <Tile href="/qualidade/quarentena" label="Lotes em quarentena" value={num(quarentena)} tone={quarentena ? "warn" : "default"} hint="aguardando inspeção" />
            <Tile href="/qualidade/lotes" label="Lotes vencidos ou vencendo" value={num(lotesVencendo)} tone={lotesVencendo ? "danger" : "default"} hint="validade em até 30 dias, com saldo" />
            <Tile href="/compras/sugestao" label="Abaixo do estoque mínimo" value={num(abaixoMin)} tone={abaixoMin ? "danger" : "default"} hint="disponível liberado" />
            <Tile href="/qualidade/registros" label="Registros ANVISA" value={num(registros)} tone={registros ? "warn" : "default"} hint="vencidos ou vencendo em 90 dias" />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {comercial || estoque ? (
          <Card title="Próximas cirurgias" className="xl:col-span-2" actions={<Link href="/comercial/agenda" className="text-xs text-teal-700 hover:underline">Agenda</Link>}>
            <Table head={["Data", "Nº", "Hospital", "Médico", "Procedimento", "Vale", "Status"]} empty={proximas.length === 0}>
              {proximas.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="text-xs">{dateTime(c.dataHora)}</Td>
                  <Td>
                    <Link href={`/comercial/cirurgias/${c.id}`} className="font-mono text-teal-700 hover:underline">CIR-{c.numero}</Link>
                  </Td>
                  <Td>{c.hospital.nomeFantasia ?? c.hospital.razaoSocial}</Td>
                  <Td>{c.medico.nome}</Td>
                  <Td className="max-w-48 truncate">{c.procedimento?.descricao ?? "—"}</Td>
                  <Td>{c._count.remessas ? "sim" : <span className="text-amber-600">pendente</span>}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : null}
        {comercial && (
          <Card title="Vendas faturadas — 6 meses">
            <div className="flex h-48 items-end gap-3" role="img" aria-label="Gráfico de vendas mensais">
              {meses.map((m) => (
                <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] text-slate-500">{m.total ? money(m.total).replace(/,\d{2}$/, "") : ""}</div>
                  <div className="relative w-full rounded-t bg-teal-100" style={{ height: `${(m.total / maxVenda) * 140}px`, minHeight: m.total ? 4 : 1 }} title={`${m.label}: ${money(m.total)} · margem ${money(m.margem)}`}>
                    <div className="absolute bottom-0 w-full rounded-t bg-teal-600" style={{ height: `${m.total ? Math.max(0, (m.margem / m.total) * 100) : 0}%` }} />
                  </div>
                  <div className="text-xs capitalize text-slate-600">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-teal-100" /> vendido</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-teal-600" /> margem</span>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
