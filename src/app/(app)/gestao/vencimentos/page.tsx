import Link from "next/link";
import { Celula } from "../../financeiro/_lib/visual";
import { Badge, KpiGrid, PageHeader, Stat, Table, Td, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money, num } from "@/lib/format";
import { Filtros, FiltroSelect } from "../../comercial/_components/filtros";
import { vencimentosDados, type SP } from "../_lib/consultas";
import { FAIXAS_VENCIMENTO } from "../_lib/vencimentos";
import { BotaoCsv, PERFIS_GESTAO } from "../_lib/visual";

const COR: BadgeColor[] = ["red", "red", "yellow", "yellow", "gray"];
const LOCAL: Record<string, string> = { DEPOSITO: "Depósito", HOSPITAL: "Consignado", QUARENTENA: "Quarentena" };

export default async function VencimentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser([...PERFIS_GESTAO]);
  const sp = await searchParams;
  const d = await vencimentosDados();
  const f = typeof sp.faixa === "string" && /^[0-4]$/.test(sp.faixa) ? Number(sp.faixa) : null;
  const linhas = f === null ? d.linhas : d.linhas.filter((l) => l.faixa === f);
  const v = d.totais.valor;
  const q = d.totais.quantidade;
  const ate = (n: number) => v.slice(1, n + 1).reduce((s, x) => s + Math.round(x * 100), 0) / 100; // acumulado a vencer
  const qate = (n: number) => q.slice(1, n + 1).reduce((s, x) => s + x, 0);
  return (
    <>
      <PageHeader title="Vencimentos de lotes" subtitle="Saldo em estoque (depósito, consignado e quarentena) de lotes que vencem em até 180 dias. Valor em risco = saldo × custo médio do produto. Não conforme fica de fora." />
      <KpiGrid cols={5}>
        <Stat label="Já vencido" value={money(v[0])} tone={v[0] > 0 ? "danger" : "default"} hint={`${num(q[0])} un.`} />
        <Stat label="Vence em 30 dias" value={money(ate(1))} tone={ate(1) > 0 ? "warn" : "default"} hint={`${num(qate(1))} un.`} />
        <Stat label="Vence em 60 dias" value={money(ate(2))} hint={`${num(qate(2))} un. (acumulado)`} />
        <Stat label="Vence em 90 dias" value={money(ate(3))} hint={`${num(qate(3))} un. (acumulado)`} />
        <Stat label="Vence em 180 dias" value={money(ate(4))} hint={`${num(qate(4))} un. (acumulado)`} />
      </KpiGrid>
      <Filtros limparHref="/gestao/vencimentos">
        <FiltroSelect label="Faixa" name="faixa" options={FAIXAS_VENCIMENTO.map((n, i) => ({ value: String(i), label: n }))} defaultValue={f === null ? undefined : String(f)} />
      </Filtros>
      <div className="space-y-3">
        <Table
          titulo="Lotes por validade"
          icone="frasco"
          contagem={linhas.length}
          acoes={<span className="flex items-center gap-2"><Link href="/qualidade/lotes" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50">Ver lotes</Link><BotaoCsv href="/gestao/vencimentos/exportar" params={{}} /></span>}
          head={["Produto", "Lote", "Validade", <span key="d" className="block text-right">Dias</span>, "Local", <span key="q" className="block text-right">Quantidade</span>, <span key="v" className="block text-right">Valor em risco</span>, "Faixa"]}
          empty={linhas.length === 0}
          emptyText="Nenhum lote com saldo vence nos próximos 180 dias."
        >
          {linhas.map((l) => (
            <tr key={`${l.loteId}-${l.localTipo}-${l.hospitalId ?? ""}`}>
              <Td className="max-w-[22rem]"><Celula principal={l.produto} sub={l.codigo} /></Td>
              <Td>{l.lote}</Td>
              <Td>{date(l.validade)}</Td>
              <Td className={`tnum text-right ${l.dias < 0 ? "text-rose-600" : ""}`}>{num(l.dias)}</Td>
              <Td><Celula principal={LOCAL[l.localTipo] ?? l.localTipo} sub={l.hospital ?? undefined} /></Td>
              <Td className="tnum text-right">{num(l.quantidade)}</Td>
              <Td className="tnum text-right font-semibold">{money(l.valor)}</Td>
              <Td><Badge color={COR[l.faixa]}>{FAIXAS_VENCIMENTO[l.faixa]}</Badge></Td>
            </tr>
          ))}
          {linhas.length > 0 && (
            <tr className="bg-slate-50 font-semibold">
              <Td>Total</Td><Td /><Td /><Td /><Td />
              <Td className="tnum text-right">{num(linhas.reduce((s, l) => s + l.quantidade, 0))}</Td>
              <Td className="tnum text-right">{money(linhas.reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100)}</Td>
              <Td />
            </tr>
          )}
        </Table>
        <Table
          titulo="Consignado por hospital (valor em risco)"
          icone="predio"
          contagem={d.hospitais.length}
          head={["Hospital", <span key="l" className="block text-right">Lotes</span>, ...FAIXAS_VENCIMENTO.map((n) => <span key={n} className="block text-right">{n}</span>), <span key="t" className="block text-right">Total</span>]}
          empty={d.hospitais.length === 0}
          emptyText="Nenhum lote consignado em hospital vence nos próximos 180 dias."
        >
          {d.hospitais.map((h) => (
            <tr key={h.hospitalId}>
              <Td className="max-w-[20rem]"><Celula principal={h.hospital} /></Td>
              <Td className="tnum text-right">{num(h.lotes)}</Td>
              {h.faixas.map((x, i) => <Td key={i} className={`tnum text-right ${i < 2 && x > 0 ? "text-rose-600" : ""}`}>{x ? money(x) : "—"}</Td>)}
              <Td className="tnum text-right font-semibold">{money(h.total)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
