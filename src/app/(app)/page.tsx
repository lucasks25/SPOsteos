import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, KpiGrid, LinkButton, PageHeader, StatusBadge, Table, Td, btn, cx } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { dateTime, diasAtras, money, num, toNumber } from "@/lib/format";
import type { Perfil } from "@/generated/prisma/client";
import { hojeUTC } from "./financeiro/_lib/datas";
import { faixasAbertas } from "./financeiro/_lib/painel";

const DIA = 24 * 60 * 60 * 1000;

/** Meia-noite de hoje em Brasília (UTC−3). */
function hojeSP() {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(`${agora.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

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

const ve = (perfil: Perfil, ...perfis: Perfil[]) => perfil === "ADMIN" || perfis.includes(perfil);

export default async function Painel() {
  const user = await requireUser();
  const p = user.perfil;
  const hoje = hojeSP();
  const hojeFin = hojeUTC(); // dia de hoje como o financeiro o usa (meia-noite UTC do dia em Brasília)
  const amanha = new Date(hoje.getTime() + DIA);
  const em7 = new Date(hoje.getTime() + 7 * DIA);
  const em30 = new Date(hoje.getTime() + 30 * DIA);
  const em90 = new Date(hoje.getTime() + 90 * DIA);
  const inicioMes = new Date(`${new Date(hoje.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7)}-01T00:00:00-03:00`);
  const seisMeses = diasAtras(186);

  const [
    cirHoje, cir7, aFaturar, vendasMes, recFaixas, pagFaixas, quarentena, lotesVencendo, produtos, saldosLib, registros, remessasPend, proximas, vendas6m,
  ] = await Promise.all([
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: amanha }, status: { not: "CANCELADA" } } }),
    db.cirurgia.count({ where: { dataHora: { gte: hoje, lt: em7 }, status: { not: "CANCELADA" } } }),
    db.cirurgia.count({ where: { status: "REALIZADA" } }),
    db.pedidoVenda.aggregate({ where: { status: "FATURADO", faturadoEm: { gte: inicioMes } }, _sum: { total: true, custoTotal: true }, _count: true }),
    faixasAbertas("receber", hojeFin),
    faixasAbertas("pagar", hojeFin),
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

  const pagar7Valor = pagFaixas.vencido.valor + pagFaixas.hoje.valor + pagFaixas.ate7.valor;
  const pagar7Qtd = pagFaixas.vencido.qtd + pagFaixas.hoje.qtd + pagFaixas.ate7.qtd;
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

  const pendencias: { key: string; ok: boolean; node: ReactNode }[] = [];
  const add = (key: string, mostrar: boolean, qtd: number, props: Omit<React.ComponentProps<typeof Pendencia>, "titulo"> & { titulo: (n: number) => string }) => {
    if (mostrar && qtd > 0) pendencias.push({ key, ok: false, node: <Pendencia key={key} {...props} titulo={props.titulo(qtd)} /> });
  };
  add("rec", financeiro, recFaixas.vencido.qtd, { href: "/financeiro/receber?vencidos=1", icon: "receber", tom: "danger", titulo: (n) => `${n} título(s) a receber vencido(s)`, nota: `${money(recFaixas.vencido.valor)} em atraso`, acao: "Cobrar" });
  add("venc", estoque, lotesVencendo, { href: "/qualidade/lotes", icon: "alerta", tom: "danger", titulo: (n) => `${n} lote(s) vencido(s) ou vencendo`, nota: "validade em até 30 dias, com saldo", acao: "Abrir" });
  add("min", estoque, abaixoMin, { href: "/compras/sugestao", icon: "tendencia", tom: "danger", titulo: (n) => `${n} produto(s) abaixo do mínimo`, nota: "disponível liberado insuficiente", acao: "Comprar" });
  add("pag", financeiro, pagar7Qtd, { href: "/financeiro/pagar", icon: "pagar", tom: "warn", titulo: (n) => `${n} título(s) a pagar em 7 dias`, nota: `${money(pagar7Valor)}, incluindo atrasados`, acao: "Ver" });
  add("fat", comercial, aFaturar, { href: "/comercial/cirurgias?status=REALIZADA", icon: "documento", tom: "warn", titulo: (n) => `${n} cirurgia(s) a faturar`, nota: "realizadas sem pedido de venda", acao: "Faturar" });
  add("rem", estoque, remessasPend, { href: "/estoque/remessas?status=ENVIADA", icon: "caminhao", tom: "warn", titulo: (n) => `${n} remessa(s) a conferir`, nota: "vales enviados aos hospitais", acao: "Conferir" });
  add("qua", estoque, quarentena, { href: "/qualidade/quarentena", icon: "frasco", tom: "warn", titulo: (n) => `${n} lote(s) em quarentena`, nota: "aguardando inspeção", acao: "Inspecionar" });
  add("reg", estoque, registros, { href: "/qualidade/registros", icon: "livro", tom: "warn", titulo: (n) => `${n} registro(s) ANVISA a vencer`, nota: "vencidos ou vencendo em 90 dias", acao: "Revisar" });

  const indicadores: ReactNode[] = [];
  if (comercial) {
    indicadores.push(<Indicador key="h" href="/comercial/agenda" label="Cirurgias hoje" value={num(cirHoje)} nota={`${num(cir7)} nos próximos 7 dias`} />);
    indicadores.push(
      <Indicador key="v" href="/comercial/comissoes" label="Vendas no mês" value={money(vendidoMes)} nota={`margem ${money(margemMes)}${vendidoMes ? ` (${((margemMes / vendidoMes) * 100).toFixed(1)}%)` : ""} · ${vendasMes._count} NF`} notaTom={vendidoMes && margemMes > 0 ? "ok" : undefined} />,
    );
    indicadores.push(<Indicador key="f" href="/comercial/cirurgias?status=REALIZADA" label="Cirurgias a faturar" value={num(aFaturar)} tom={aFaturar ? "warn" : "default"} nota="realizadas sem pedido de venda" notaTom={aFaturar ? "warn" : undefined} />);
  }
  if (financeiro) {
    indicadores.push(<Indicador key="r" href="/financeiro/receber?vencidos=1" label="A receber vencido" value={money(recFaixas.vencido.valor)} tom={recFaixas.vencido.qtd ? "danger" : "default"} nota={`${recFaixas.vencido.qtd} título(s), descontadas baixas parciais`} notaTom={recFaixas.vencido.qtd ? "danger" : undefined} />);
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
            <ul className="-m-3 divide-y divide-slate-200">{pendencias.map((x) => x.node)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
