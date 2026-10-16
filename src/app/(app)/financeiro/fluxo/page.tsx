import Link from "next/link";
import { Field, Select } from "@/components/form";
import { Aviso, FilterBar, KpiGrid, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { addDias, diaMes, hojeUTC, mesAno, parseDia, ymd } from "@/lib/datas";
import { calcularFluxo, type Gran } from "../_lib/fluxo";

type SP = Record<string, string | string[] | undefined>;

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const w = max > 0 ? Math.min(100, (Math.abs(valor) / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded bg-slate-100" aria-hidden="true">
      <div className={`h-2 rounded ${cor}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export default async function FluxoPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const hoje = hojeUTC();
  const g: Gran = sp.g === "mes" ? "mes" : "semana";
  const de = parseDia(sp.de) ?? hoje;
  let ate = parseDia(sp.ate) ?? addDias(de, 90);
  if (ate < de) ate = addDias(de, 90);
  if (ate > addDias(de, 730)) ate = addDias(de, 730); // limite de 2 anos
  const fluxo = await calcularFluxo(de, ate, g, hoje);
  const max = Math.max(1, ...fluxo.faixas.flatMap((f) => [f.recPrev + f.recReal, f.pagPrev + f.pagReal]));
  const totRec = fluxo.faixas.reduce((s, f) => s + f.recPrev + f.recReal, 0);
  const totPag = fluxo.faixas.reduce((s, f) => s + f.pagPrev + f.pagReal, 0);
  const rotulo = (d: Date) => (g === "semana" ? `Sem. ${diaMes(d)}` : mesAno(d));

  return (
    <>
      <PageHeader title="Fluxo de caixa" subtitle={`Entradas e saídas do Financeiro de ${date(de)} a ${date(ate)}: previsto (títulos em aberto) mais realizado (baixas e lançamentos).`} />
      <FilterBar>
        <Field label="De" name="de" type="date" defaultValue={ymd(de)} className="w-40" />
        <Field label="Até" name="ate" type="date" defaultValue={ymd(ate)} className="w-40" />
        <Select label="Agrupar por" name="g" defaultValue={g} options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }]} placeholder="" className="w-36" />
        <button className={btn.secondary}>Atualizar</button>
        <Link href="/financeiro/fluxo" className={btn.ghost}>
          Padrão (90 dias)
        </Link>
      </FilterBar>

      <KpiGrid>
        <Stat icon="banco" label="Saldo no início" value={money(fluxo.saldoInicial)} hint="contas ativas" />
        <Stat icon="receber" label="Entradas no período" value={money(totRec)} />
        <Stat icon="pagar" label="Saídas no período" value={money(totPag)} />
        <Stat icon="banco" label="Saldo final" value={money(fluxo.faixas.at(-1)?.acumulado ?? fluxo.saldoInicial)} tone={(fluxo.faixas.at(-1)?.acumulado ?? 0) < 0 ? "danger" : "default"} />
      </KpiGrid>

      {de <= hoje && (fluxo.atrasadosReceber > 0 || fluxo.atrasadosPagar > 0) && (
        <Aviso tom="alerta" className="mb-4"><div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <strong>Atrasados (já incluídos no acumulado):</strong>
          <span>
            a receber {money(fluxo.atrasadosReceber)} — <Link href="/financeiro/receber?vencidos=1" className="underline">ver</Link>
          </span>
          <span>
            a pagar {money(fluxo.atrasadosPagar)} — <Link href="/financeiro/pagar?vencidos=1" className="underline">ver</Link>
          </span>
        </div></Aviso>
      )}

      <Table titulo={g === "semana" ? "Fluxo por semana" : "Fluxo por mês"} icone="tendencia" contagem={fluxo.faixas.length} acoes={<Link href="/financeiro/contas" className={btn.small}>Contas bancárias</Link>} head={[g === "semana" ? "Semana" : "Mês", "Entradas", "Saídas", "Comparativo", "Saldo do período", "Acumulado"]} empty={fluxo.faixas.length === 0} emptyText="Nenhuma movimentação prevista ou realizada neste período.">
        {fluxo.faixas.map((f) => {
          const ent = f.recPrev + f.recReal;
          const sai = f.pagPrev + f.pagReal;
          return (
            <tr key={f.inicio.getTime()}>
              <Td>{rotulo(f.inicio)}</Td>
              <Td className="text-right tnum text-emerald-700">
                {money(ent)}
                {f.recReal > 0 && <span className="ml-1 text-xs text-slate-500">({money(f.recReal)} realizado)</span>}
              </Td>
              <Td className="text-right tnum text-rose-700">
                {money(sai)}
                {f.pagReal > 0 && <span className="ml-1 text-xs text-slate-500">({money(f.pagReal)} realizado)</span>}
              </Td>
              <Td className="w-48 min-w-40">
                <div className="space-y-1">
                  <Barra valor={ent} max={max} cor="bg-emerald-500" />
                  <Barra valor={sai} max={max} cor="bg-rose-500" />
                </div>
              </Td>
              <Td className={`text-right tnum ${f.saldoPeriodo < 0 ? "text-rose-700" : ""}`}>{money(f.saldoPeriodo)}</Td>
              <Td className={`text-right font-medium tnum ${f.acumulado < 0 ? "text-rose-700" : ""}`}>{money(f.acumulado)}</Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-2 text-xs text-slate-500">
        Previsto = saldo dos títulos em aberto por vencimento. Realizado = baixas e lançamentos já feitos nas contas ativas.
      </p>
    </>
  );
}
