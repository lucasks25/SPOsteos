import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, KpiGrid, LinkButton, PageHeader, StatusBadge, Table, Td, btn, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { dateTime, diasAtras, money, num, toNumber } from "@/lib/format";
import { areasDoPerfil, carregarPendencias, listarPendencias } from "@/lib/pendencias";
import { hojeSP } from "@/lib/datas";

const DIA = 24 * 60 * 60 * 1000;

type Tom = "default" | "warn" | "danger" | "ok";
const corTom = { default: "text-slate-900", warn: "text-amber-600", danger: "text-rose-600", ok: "text-emerald-600" };

/** Célula da faixa de indicadores: rótulo, valor e nota colorida; clicável. */
function Indicador({ href, label, value, nota, tom = "default", notaTom }: { href: string; label: string; value: ReactNode; nota?: ReactNode; tom?: Tom; notaTom?: Tom }) {
  return (
    <Link href={href} className="block px-3 py-2.5 transition-colors duration-150 hover:bg-slate-50">
      <div className="text-xs text-slate-600">{label}</div>
      <div className={cx("tnum mt-0.5 text-xl font-bold", corTom[tom])}>{value}</div>
      {nota && <div className={cx("mt-0.5 text-xs", notaTom ? corTom[notaTom] : "text-slate-600")}>{nota}</div>}
    </Link>
  );
}

/** Item de "Pendências": ícone colorido, título com contagem, nota e ação direta. */
function Pendencia({ href, icon, tom, titulo, nota, acao }: { href: string; icon: IconName; tom: "warn" | "danger"; titulo: string; nota: string; acao: string }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded text-white", tom === "danger" ? "bg-rose-600" : "bg-amber-500")} aria-hidden="true">
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-[13px] font-semibold text-teal-700 hover:underline">{titulo}</Link>
        <div className="truncate text-xs text-slate-600">{nota}</div>
      </div>
      <Link href={href} className={btn.small}>{acao}</Link>
    </li>
  );
}

export default async function Painel() {
  const user = await requireUser();
  const p = user.perfil;
  const hoje = hojeSP();
  const amanha = new Date(hoje.getTime() + DIA);
  const em7 = new Date(hoje.getTime() + 7 * DIA);
  const inicioMes = new Date(`${new Date(hoje.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01T00:00:00-03:00`);
  const seisMeses = diasAtras(186);

  const pend = await carregarPendencias(p);
  const { comercial, financeiro, estoque } = areasDoPerfil(p);
  const [cirHoje, cir7, vendasMes, proximas, vendas6m] = await Promise.all([
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: amanha }, status: { not: "CANCELADA" } } }),
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: em7 }, status: { not: "CANCELADA" } } }),
    db.pedidoVenda.aggregate({ where: { status: "FATURADO", faturadoEm: { gte: inicioMes } }, _sum: { total: true, custoTotal: true }, _count: true }),
    db.cirurgia.findMany({
      where: { dataHora: { gte: hoje }, status: { in: ["AGENDADA", "CONFIRMADA"] } },
      include: { hospital: true, medico: true, procedimento: true, _count: { select: { remessas: true } } },
      orderBy: { dataHora: "asc" },
      take: 10,
    }),
    db.pedidoVenda.findMany({ where: { status: "FATURADO", faturadoEm: { gte: seisMeses } }, select: { faturadoEm: true, total: true, custoTotal: true } }),
  ]);
  const { aFaturar, quarentena, lotesVencendo, recVencido, pagar7 } = pend;
  const pagar7Valor = pagar7.valor;
  const pagar7Qtd = pagar7.qtd;
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

  const pendencias = listarPendencias(pend).map((x) => <Pendencia key={x.key} href={x.href} icon={x.icon} tom={x.tom} titulo={x.titulo} nota={x.nota} acao={x.acao} />);

  const indicadores: ReactNode[] = [];
  if (comercial) {
    indicadores.push(<Indicador key="h" href="/comercial/agenda" label="Cirurgias hoje" value={num(cirHoje)} nota={`${num(cir7)} nos próximos 7 dias`} />);
    indicadores.push(
      <Indicador key="v" href="/comercial/comissoes" label="Vendas no mês" value={money(vendidoMes)} nota={`margem ${money(margemMes)}${vendidoMes ? ` (${((margemMes / vendidoMes) * 100).toFixed(1)}%)` : ""} · ${vendasMes._count} NF`} notaTom={vendidoMes && margemMes > 0 ? "ok" : undefined} />,
    );
    indicadores.push(<Indicador key="f" href="/comercial/cirurgias?status=REALIZADA" label="Cirurgias a faturar" value={num(aFaturar)} tom={aFaturar ? "warn" : "default"} nota="realizadas sem pedido de venda" notaTom={aFaturar ? "warn" : undefined} />);
  }
  if (financeiro) {
    indicadores.push(<Indicador key="r" href="/financeiro/receber?vencidos=1" label="A receber vencido" value={money(recVencido.valor)} tom={recVencido.qtd ? "danger" : "default"} nota={`${recVencido.qtd} título(s), descontadas baixas parciais`} notaTom={recVencido.qtd ? "danger" : undefined} />);
    indicadores.push(<Indicador key="p" href="/financeiro/pagar" label="A pagar em 7 dias" value={money(pagar7Valor)} tom={pagar7Qtd ? "warn" : "default"} nota={`${pagar7Qtd} título(s), incluindo atrasados`} notaTom={pagar7Qtd ? "warn" : undefined} />);
  }
  if (estoque) {
    indicadores.push(<Indicador key="q" href="/qualidade/quarentena" label="Lotes em quarentena" value={num(quarentena)} tom={quarentena ? "warn" : "default"} nota="aguardando inspeção" />);
    indicadores.push(<Indicador key="l" href="/qualidade/lotes" label="Vencidos ou vencendo" value={num(lotesVencendo)} tom={lotesVencendo ? "danger" : "default"} nota="validade em até 30 dias" notaTom={lotesVencendo ? "danger" : undefined} />);
  }
  const cols = indicadores.length >= 5 ? 5 : indicadores.length === 4 ? 4 : 3;
  while (indicadores.length % cols !== 0) indicadores.push(<div key={`pad${indicadores.length}`} />);

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={`Olá, ${user.nome.split(" ")[0]}. Resumo da operação; clique em um indicador para ver os detalhes.`}
        actions={comercial ? <LinkButton href="/comercial/cirurgias/nova" icon="mais">Nova cirurgia</LinkButton> : undefined}
      />
      {indicadores.length > 0 && <KpiGrid cols={cols}>{indicadores}</KpiGrid>}

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
          {comercial && (
            <Card title="Vendas faturadas — 6 meses" icon="grafico">
              <div className="mb-2 flex gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-teal-100" /> vendido</span>
                <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-teal-600" /> margem</span>
              </div>
              <div className="flex h-48 items-end gap-3" role="img" aria-label="Gráfico de vendas mensais">
                {meses.map((m) => (
                  <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
                    <div className="tnum text-xs text-slate-600">{m.total ? money(m.total).replace(/,\d{2}$/, "") : ""}</div>
                    <div className="relative w-full rounded-t bg-teal-100" style={{ height: `${(m.total / maxVenda) * 140}px`, minHeight: m.total ? 4 : 1 }} title={`${m.label}: ${money(m.total)} · margem ${money(m.margem)}`}>
                      <div className="absolute bottom-0 w-full rounded-t bg-teal-600" style={{ height: `${m.total ? Math.max(0, (m.margem / m.total) * 100) : 0}%` }} />
                    </div>
                    <div className="text-xs capitalize text-slate-600">{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="-mx-3 -mb-3 mt-3 border-t border-slate-200 py-2 text-center">
                <Link href="/comercial/comissoes" className="text-xs font-semibold text-teal-700 hover:underline">Ver tudo</Link>
              </div>
            </Card>
          )}
          {(comercial || estoque) && (
            <Table
              titulo="Próximas cirurgias"
              icone="calendario"
              contagem={proximas.length}
              acoes={<Link href="/comercial/agenda" className={btn.small}>Ver agenda</Link>}
              head={["Data", "Cirurgia", "Hospital", "Procedimento", "Vale", "Situação"]}
              empty={proximas.length === 0}
              emptyText="Nenhuma cirurgia agendada a partir de hoje."
              emptyAction={<LinkButton href="/comercial/cirurgias/nova" variant="secondary" icon="mais">Agendar cirurgia</LinkButton>}
            >
              {proximas.map((c) => (
                <tr key={c.id}>
                  <Td className="tnum">{dateTime(c.dataHora)}</Td>
                  <Td>
                    <Link href={`/comercial/cirurgias/${c.id}`} className="font-semibold text-teal-700 hover:underline">CIR-{c.numero}</Link>
                    <div className="text-xs text-slate-500">{c.medico.nome}</div>
                  </Td>
                  <Td>{c.hospital.nomeFantasia ?? c.hospital.razaoSocial}</Td>
                  <Td className="max-w-48 truncate">{c.procedimento?.descricao ?? "—"}</Td>
                  <Td>{c._count.remessas ? "sim" : <span className="text-amber-600">pendente</span>}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <Card title={`Pendências (${pendencias.length})`} icon="alerta" className="self-start">
          {pendencias.length === 0 ? (
            <EmptyState icon="ok" text="Nada pendente para o seu perfil. Tudo em dia." />
          ) : (
            <ul className="-m-3 divide-y divide-slate-200">{pendencias}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
