import type { ReactNode } from "react";
import { Card, EmptyState, KpiGrid, PageHeader } from "@/components/ui";
import { money, num } from "@/lib/format";
import { hojeSP } from "@/lib/datas";
import type { Perfil } from "@/generated/prisma/client";
import { indicadoresComerciais, proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";
import { Indicador, ItemPendencia } from "./componentes";
import { areasDoPerfil, carregarPendencias, listarPendencias } from "./pendencias";
import { ProximasCirurgias } from "./proximas-cirurgias";
import { Vendas6Meses } from "./vendas-6-meses";

/**
 * Painel por perfil: composição SÓ LEITURA e navegação (docs/ARQUITETURA.md, ADR-7). Não cria nada: cada indicador,
 * linha e pendência leva à tela do módulo dono. Os números vêm das funções públicas de cada módulo.
 */
export async function ConteudoPainel({ nome, perfil }: { nome: string; perfil: Perfil }) {
  const hoje = hojeSP();
  const pend = await carregarPendencias(perfil);
  const { comercial, financeiro, estoque } = areasDoPerfil(perfil);
  const [ind, proximas] = await Promise.all([
    comercial ? indicadoresComerciais(hoje) : Promise.resolve(null),
    comercial || estoque ? proximasCirurgias(hoje) : Promise.resolve(null),
  ]);
  const { aFaturar, quarentena, lotesVencendo, recVencido, pagar7 } = pend;

  const indicadores: ReactNode[] = [];
  if (ind) {
    const { vendidoMes, margemMes } = ind;
    indicadores.push(<Indicador key="h" href="/comercial/agenda" icone="calendario" label="Cirurgias hoje" value={num(ind.cirurgiasHoje)} nota={`${num(ind.cirurgias7dias)} nos próximos 7 dias`} />);
    indicadores.push(
      <Indicador key="v" href="/comercial/comissoes" icone="tendencia" label="Vendas no mês" value={money(vendidoMes)} nota={`margem ${money(margemMes)}${vendidoMes ? ` (${((margemMes / vendidoMes) * 100).toFixed(1)}%)` : ""} · ${ind.notasMes} NF`} notaTom={vendidoMes && margemMes > 0 ? "ok" : undefined} />,
    );
    indicadores.push(<Indicador key="f" href="/comercial/cirurgias?status=REALIZADA" icone="documento" label="Cirurgias a faturar" value={num(aFaturar)} tom={aFaturar ? "warn" : "default"} nota="realizadas sem pedido de venda" notaTom={aFaturar ? "warn" : undefined} />);
  }
  if (financeiro) {
    indicadores.push(<Indicador key="r" href="/financeiro/receber?vencidos=1" icone="receber" label="A receber vencido" value={money(recVencido.valor)} tom={recVencido.qtd ? "danger" : "default"} nota={`${recVencido.qtd} título(s), descontadas baixas parciais`} notaTom={recVencido.qtd ? "danger" : undefined} />);
    indicadores.push(<Indicador key="p" href="/financeiro/pagar" icone="pagar" label="A pagar em 7 dias" value={money(pagar7.valor)} tom={pagar7.qtd ? "warn" : "default"} nota={`${pagar7.qtd} título(s), incluindo atrasados`} notaTom={pagar7.qtd ? "warn" : undefined} />);
  }
  if (estoque) {
    indicadores.push(<Indicador key="q" href="/qualidade/quarentena" icone="frasco" label="Lotes em quarentena" value={num(quarentena)} tom={quarentena ? "warn" : "default"} nota="aguardando inspeção" />);
    indicadores.push(<Indicador key="l" href="/qualidade/lotes" icone="alerta" label="Vencidos ou vencendo" value={num(lotesVencendo)} tom={lotesVencendo ? "danger" : "default"} nota="validade em até 30 dias" notaTom={lotesVencendo ? "danger" : undefined} />);
  }
  // 7 ou 8 indicadores: 4 por linha (5 colunas deixaria um cartão órfão em 3 colunas)
  const cols = indicadores.length >= 7 || indicadores.length === 4 ? 4 : indicadores.length >= 5 ? 5 : 3;
  while (indicadores.length % cols !== 0) indicadores.push(<div key={`pad${indicadores.length}`} />);

  const pendencias = listarPendencias(pend).map((x) => <ItemPendencia key={x.key} p={x} />);

  return (
    <>
      <PageHeader title="Painel" subtitle={`Olá, ${nome.split(" ")[0]}. Resumo da operação; clique em um indicador para ver os detalhes.`} />
      {indicadores.length > 0 && <KpiGrid cols={cols}>{indicadores}</KpiGrid>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          {ind && <Vendas6Meses meses={ind.meses} />}
          {proximas && <ProximasCirurgias cirurgias={proximas} />}
        </div>

        <Card title={`Pendências (${pendencias.length})`} icon="alerta" className="self-start">
          {pendencias.length === 0 ? (
            <EmptyState icon="ok" text="Nada pendente para o seu perfil. Tudo em dia." />
          ) : (
            <ul className="-m-4 divide-y divide-slate-100">{pendencias}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
