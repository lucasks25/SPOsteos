import Link from "next/link";
import { LinkButton, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { addDias, diaMes, hojeUTC, mesAno, parseDia, ymd } from "../_lib/datas";
import { calcularFluxo, type Gran } from "../_lib/fluxo";

type SP = Record<string, string | string[] | undefined>;
const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const w = max > 0 ? Math.min(100, (Math.abs(valor) / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded bg-slate-100">
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
      <PageHeader title="Fluxo de caixa" subtitle={`${date(de)} a ${date(ate)} — previsto (títulos em aberto) mais realizado (baixas e lançamentos)`} />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">De</span>
          <input type="date" name="de" defaultValue={ymd(de)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Até</span>
          <input type="date" name="ate" defaultValue={ymd(ate)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Agrupar por</span>
          <select name="g" defaultValue={g} className={inputCls}>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
          </select>
        </label>
        <button className={btn.secondary}>Atualizar</button>
        <Link href="/financeiro/fluxo" className={btn.ghost}>
          Padrão (90 dias)
        </Link>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Saldo no início" value={money(fluxo.saldoInicial)} hint="contas ativas" />
        <Stat label="Entradas no período" value={money(totRec)} />
        <Stat label="Saídas no período" value={money(totPag)} />
        <Stat label="Saldo final" value={money(fluxo.faixas.at(-1)?.acumulado ?? fluxo.saldoInicial)} tone={(fluxo.faixas.at(-1)?.acumulado ?? 0) < 0 ? "danger" : "default"} />
      </div>

      {de <= hoje && (fluxo.atrasadosReceber > 0 || fluxo.atrasadosPagar > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Atrasados (já incluídos no saldo acumulado):</strong>
          <span>
            a receber {money(fluxo.atrasadosReceber)} — <Link href="/financeiro/receber?vencidos=1" className="underline">ver</Link>
          </span>
          <span>
            a pagar {money(fluxo.atrasadosPagar)} — <Link href="/financeiro/pagar?vencidos=1" className="underline">ver</Link>
          </span>
        </div>
      )}

      <Table head={[g === "semana" ? "Semana" : "Mês", "Entradas", "Saídas", "", "Saldo do período", "Acumulado"]} empty={fluxo.faixas.length === 0}>
        {fluxo.faixas.map((f) => {
          const ent = f.recPrev + f.recReal;
          const sai = f.pagPrev + f.pagReal;
          return (
            <tr key={f.inicio.getTime()}>
              <Td>{rotulo(f.inicio)}</Td>
              <Td className="tabular-nums text-emerald-700">
                {money(ent)}
                {f.recReal > 0 && <span className="ml-1 text-xs text-slate-400">({money(f.recReal)} realizado)</span>}
              </Td>
              <Td className="tabular-nums text-rose-700">
                {money(sai)}
                {f.pagReal > 0 && <span className="ml-1 text-xs text-slate-400">({money(f.pagReal)} realizado)</span>}
              </Td>
              <Td className="w-48 min-w-40">
                <div className="space-y-1">
                  <Barra valor={ent} max={max} cor="bg-emerald-500" />
                  <Barra valor={sai} max={max} cor="bg-rose-500" />
                </div>
              </Td>
              <Td className={`text-right tabular-nums ${f.saldoPeriodo < 0 ? "text-rose-700" : ""}`}>{money(f.saldoPeriodo)}</Td>
              <Td className={`text-right font-medium tabular-nums ${f.acumulado < 0 ? "text-rose-700" : ""}`}>{money(f.acumulado)}</Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-2 text-xs text-slate-500">
        Previsto = saldo dos títulos em aberto por vencimento. Realizado = baixas e lançamentos já feitos nas contas ativas.
      </p>
      <div className="mt-4">
        <LinkButton href="/financeiro/contas" variant="secondary">
          Contas bancárias
        </LinkButton>
      </div>
    </>
  );
}
