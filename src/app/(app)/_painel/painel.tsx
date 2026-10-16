import type { ReactNode } from "react";
import { Card, EmptyState, KpiGrid, PageHeader, Stat } from "@/components/ui";
import { money, num } from "@/lib/format";
import { hojeSP } from "@/lib/datas";
import type { Perfil } from "@/generated/prisma/client";
import { indicadoresComerciais, proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";
import { ItemPendencia } from "./componentes";
import { areasDoPerfil, carregarPendencias, listarPendencias } from "./pendencias";
import { ProximasCirurgias } from "./proximas-cirurgias";
import { Vendas6Meses } from "./vendas-6-meses";
import { PainelClassico, type Atalho, type Etapa, type SecaoIndicadores } from "./classico";
import pacote from "../../../../package.json";

/**
 * Painel por perfil: composição SÓ LEITURA e navegação (docs/ARQUITETURA.md, ADR-7). Não cria nada: cada indicador,
 * linha e pendência leva à tela do módulo dono. Os números vêm das funções públicas de cada módulo.
 */
export async function ConteudoPainel({ nome = "", perfil, classico = false }: { nome?: string; perfil: Perfil; classico?: boolean }) {
  const hoje = hojeSP();
  const pend = await carregarPendencias(perfil);
  const areas = areasDoPerfil(perfil);
  const { comercial, financeiro, estoque } = areas;
  const [ind, proximas] = await Promise.all([
    comercial ? indicadoresComerciais(hoje) : Promise.resolve(null),
    comercial || estoque ? proximasCirurgias(hoje) : Promise.resolve(null),
  ]);
  const { aFaturar, quarentena, lotesVencendo, recVencido, pagar7, remessas } = pend;

  const indicadores: ReactNode[] = [];
  if (ind) {
    const { vendidoMes, margemMes } = ind;
    indicadores.push(<Stat key="h" href="/comercial/agenda" label="Cirurgias hoje" value={num(ind.cirurgiasHoje)} hint={`${num(ind.cirurgias7dias)} em 7 dias`} />);
    indicadores.push(
      <Stat key="v" href="/comercial/comissoes" label="Vendas no mês" value={money(vendidoMes)} hint={`${vendidoMes ? `margem ${((margemMes / vendidoMes) * 100).toFixed(1).replace(".", ",")}%` : "sem vendas"} · ${ind.notasMes} NF`} />,
    );
    indicadores.push(<Stat key="f" href="/comercial/cirurgias?status=REALIZADA" label="Cirurgias a faturar" value={num(aFaturar)} tone={aFaturar ? "warn" : "default"} hint="sem pedido de venda" />);
  }
  if (financeiro) {
    indicadores.push(<Stat key="r" href="/financeiro/receber?vencidos=1" label="A receber vencido" value={money(recVencido.valor)} tone={recVencido.qtd ? "danger" : "default"} hint={`${recVencido.qtd} título(s)`} />);
    indicadores.push(<Stat key="p" href="/financeiro/pagar" label="A pagar em 7 dias" value={money(pagar7.valor)} tone={pagar7.qtd ? "warn" : "default"} hint={`${pagar7.qtd} título(s)`} />);
  }
  if (estoque) {
    indicadores.push(<Stat key="q" href="/qualidade/quarentena" label="Lotes em quarentena" value={num(quarentena)} tone={quarentena ? "warn" : "default"} hint="aguardando inspeção" />);
    indicadores.push(<Stat key="l" href="/qualidade/lotes" label="Vencidos ou vencendo" value={num(lotesVencendo)} tone={lotesVencendo ? "danger" : "default"} hint="validade em 30 dias" />);
    indicadores.push(<Stat key="rem" href="/estoque/remessas?status=ENVIADA" label="Remessas a conferir" value={num(remessas)} tone={remessas ? "warn" : "default"} hint="vales enviados aos hospitais" />);
  }
  const listaPendencias = listarPendencias(pend);
  if (classico) {
    return (
      <PainelClassico
        nome={nome}
        perfil={perfil}
        versao={pacote.version}
        etapas={etapasDoFluxo(areas, pend, ind?.cirurgias7dias ?? null)}
        secoes={secoesIndicadores(areas, pend, ind)}
        pendencias={listaPendencias}
        cirurgias={proximas}
        meses={ind?.meses ?? null}
        atalhos={atalhosDoPerfil(areas)}
      />
    );
  }
  const pendencias = listaPendencias.map((x) => <ItemPendencia key={x.key} p={x} />);

  const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <PageHeader title="Painel" meta={[dia]} />
      {indicadores.length > 0 && <KpiGrid cols={indicadores.length === 3 || indicadores.length === 6 ? 3 : 4}>{indicadores}</KpiGrid>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          {proximas && <ProximasCirurgias cirurgias={proximas} />}
          {ind && <Vendas6Meses meses={ind.meses} />}
        </div>

        <Card title="Pendências" semRecuo actions={<span className="tnum text-sm text-slate-500">{pendencias.length}</span>} className="self-start">
          {pendencias.length === 0 ? (
            <div className="p-4"><EmptyState icon="ok" text="Nada pendente para o seu perfil." /></div>
          ) : (
            <ul className="divide-y divide-slate-100">{pendencias}</ul>
          )}
        </Card>
      </div>
    </>
  );
}

type Areas = ReturnType<typeof areasDoPerfil>;
type Pend = Awaited<ReturnType<typeof carregarPendencias>>;
type Ind = Awaited<ReturnType<typeof indicadoresComerciais>> | null;

/** Trilha de etapas do visual clássico: quantas cirurgias estão paradas em cada passo, da agenda ao recebimento. */
function etapasDoFluxo(a: Areas, p: Pend, agendadas7: number | null): Etapa[] {
  const e: Etapa[] = [];
  if (agendadas7 !== null) e.push({ rotulo: "Agendadas (7 dias)", qtd: agendadas7, href: "/comercial/agenda", tom: "info" });
  if (a.autorizacoes) e.push({ rotulo: "Sem autorização", qtd: p.semAutorizacao, href: "/comercial/agenda", tom: "danger" });
  if (a.vales) e.push({ rotulo: "Sem vale", qtd: p.semVale, href: "/estoque/remessas", tom: "warn" });
  if (a.estoque) e.push({ rotulo: "Remessa a conferir", qtd: p.remessas, href: "/estoque/remessas?status=ENVIADA", tom: "info" });
  if (a.comercial) e.push({ rotulo: "A faturar", qtd: p.aFaturar, href: "/comercial/cirurgias?status=REALIZADA", tom: "warn" });
  if (a.comercial) e.push({ rotulo: "Pedido sem NF", qtd: p.pedidosSemNf, href: "/comercial/pedidos?status=ABERTO", tom: "warn" });
  if (a.financeiro) e.push({ rotulo: "Recebimento vencido", qtd: p.recVencido.qtd, href: "/financeiro/receber?vencidos=1", tom: "danger" });
  return e;
}

/** Quadro de indicadores do visual clássico, agrupado por área (linha de seção em negrito, como os subtotais). */
function secoesIndicadores(a: Areas, p: Pend, ind: Ind): SecaoIndicadores[] {
  const s: SecaoIndicadores[] = [];
  if (ind) {
    const pct = ind.vendidoMes ? `${((ind.margemMes / ind.vendidoMes) * 100).toFixed(1).replace(".", ",")}%` : "—";
    s.push({
      titulo: "Comercial",
      linhas: [
        { rotulo: "Cirurgias hoje", valor: num(ind.cirurgiasHoje), href: "/comercial/agenda" },
        { rotulo: "Cirurgias em 7 dias", valor: num(ind.cirurgias7dias), href: "/comercial/agenda" },
        { rotulo: "Vendas no mês", valor: money(ind.vendidoMes), href: "/comercial/comissoes" },
        { rotulo: "Margem no mês", valor: pct, href: "/comercial/comissoes" },
        { rotulo: "Notas fiscais no mês", valor: num(ind.notasMes), href: "/comercial/pedidos" },
      ],
    });
  }
  if (a.financeiro) {
    s.push({
      titulo: "Financeiro",
      linhas: [
        { rotulo: `A receber vencido (${p.recVencido.qtd})`, valor: money(p.recVencido.valor), href: "/financeiro/receber?vencidos=1", tom: p.recVencido.qtd ? "danger" : undefined },
        { rotulo: `A pagar em 7 dias (${p.pagar7.qtd})`, valor: money(p.pagar7.valor), href: "/financeiro/pagar", tom: p.pagar7.qtd ? "warn" : undefined },
        { rotulo: "Contas para aprovar", valor: num(p.aprovacoes), href: "/financeiro/aprovacoes", tom: p.aprovacoes ? "warn" : undefined },
      ],
    });
  }
  if (a.estoque) {
    s.push({
      titulo: "Estoque e qualidade",
      linhas: [
        { rotulo: "Lotes em quarentena", valor: num(p.quarentena), href: "/qualidade/quarentena", tom: p.quarentena ? "warn" : undefined },
        { rotulo: "Lotes vencidos ou vencendo", valor: num(p.lotesVencendo), href: "/qualidade/lotes", tom: p.lotesVencendo ? "danger" : undefined },
        { rotulo: "Produtos abaixo do mínimo", valor: num(p.abaixoMin), href: "/compras/sugestao", tom: p.abaixoMin ? "danger" : undefined },
        { rotulo: "Remessas a conferir", valor: num(p.remessas), href: "/estoque/remessas?status=ENVIADA", tom: p.remessas ? "warn" : undefined },
      ],
    });
  }
  return s;
}

/** Barra de ferramentas e botões do visual clássico: as telas mais usadas por área, com tecla de acesso. */
function atalhosDoPerfil(a: Areas): Atalho[] {
  const r: Atalho[] = [];
  if (a.comercial) r.push({ rotulo: "Agenda", tecla: "a", href: "/comercial/agenda", icone: "calendario" }, { rotulo: "Cirurgias", tecla: "c", href: "/comercial/cirurgias", icone: "atividade" });
  if (a.estoque) r.push({ rotulo: "Remessas", tecla: "m", href: "/estoque/remessas", icone: "caminhao" }, { rotulo: "Lotes", tecla: "l", href: "/qualidade/lotes", icone: "frasco" });
  if (a.financeiro) r.push({ rotulo: "Receber", tecla: "r", href: "/financeiro/receber", icone: "receber" }, { rotulo: "Pagar", tecla: "p", href: "/financeiro/pagar", icone: "pagar" });
  return r;
}
