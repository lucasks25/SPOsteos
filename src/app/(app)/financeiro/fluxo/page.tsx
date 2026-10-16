import Link from "next/link";
import { Field, Select } from "@/components/form";
import { Aviso, Dica, FilterBar, KpiGrid, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { CabecalhoImpresso } from "@/components/marca";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { addDias, diaMes, hojeUTC, mesAno, parseDia, ymd } from "@/lib/datas";
import { calcularFluxo, type Gran } from "../_lib/fluxo";

type SP = Record<string, string | string[] | undefined>;

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const w = max > 0 ? Math.min(100, (Math.abs(valor) / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-sm bg-slate-100" aria-hidden="true">
      <div className={`h-1.5 rounded-sm ${cor}`} style={{ width: `${w}%` }} />
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
      <div className="hidden print:block">
        <CabecalhoImpresso titulo="Fluxo de caixa">
          <p className="text-xs text-slate-600">
            {date(de)} a {date(ate)} · por {g === "semana" ? "semana" : "mês"}
          </p>
        </CabecalhoImpresso>
      </div>
      <PageHeader title="Fluxo de caixa" subtitle={`Entradas e saídas do Financeiro de ${date(de)} a ${date(ate)}: previsto (títulos em aberto) mais realizado (baixas e lançamentos).`} actions={<PrintButton />} />
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
        <Stat label="Saldo no início" value={money(fluxo.saldoInicial)} hint={`contas ativas em ${date(de)}`} />
        <Stat label="Entradas no período" value={money(totRec)} />
        <Stat label="Saídas no período" value={money(totPag)} />
        <Stat label="Saldo final" value={money(fluxo.faixas.at(-1)?.acumulado ?? fluxo.saldoInicial)} tone={(fluxo.faixas.at(-1)?.acumulado ?? 0) < 0 ? "danger" : "default"} />
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

      <Table
        titulo={g === "semana" ? "Fluxo por semana" : "Fluxo por mês"}
        contagem={fluxo.faixas.length}
        relatorio
        acoes={
          <>
            <span className="hidden items-center gap-3 text-xs text-slate-600 sm:inline-flex">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-600" aria-hidden="true" />Entradas</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-500" aria-hidden="true" />Saídas</span>
            </span>
            <Dica alinhar="direita">Previsto = saldo dos títulos em aberto por vencimento. Realizado = baixas e lançamentos já feitos nas contas ativas.</Dica>
          </>
        }
        head={[g === "semana" ? "Semana" : "Mês", "Entradas", "Saídas", { label: "Comparativo", hideOnMobile: true }, "Saldo do período", "Acumulado"]}
        rodape={
          <tr>
            <td className="px-4 py-1 text-slate-900">Total</td>
            <td className="tnum px-3 py-1 text-right text-slate-900">{money(totRec)}</td>
            <td className="tnum px-3 py-1 text-right text-slate-900">{money(totPag)}</td>
            <td />
            <td className={`tnum px-3 py-1 text-right ${totRec - totPag < 0 ? "text-rose-600" : "text-slate-900"}`}>{money(totRec - totPag)}</td>
            <td className={`tnum px-3 py-1 pr-4 text-right ${(fluxo.faixas.at(-1)?.acumulado ?? 0) < 0 ? "text-rose-600" : "text-slate-900"}`}>{money(fluxo.faixas.at(-1)?.acumulado ?? fluxo.saldoInicial)}</td>
          </tr>
        } empty={fluxo.faixas.length === 0} emptyText="Nenhuma movimentação prevista ou realizada neste período.">
        {fluxo.faixas.map((f) => {
          const ent = f.recPrev + f.recReal;
          const sai = f.pagPrev + f.pagReal;
          return (
            <tr key={f.inicio.getTime()}>
              <Td>{rotulo(f.inicio)}</Td>
              <Td className="text-right tnum">
                {money(ent)}
                {f.recReal > 0 && <span className="ml-1 text-xs text-slate-500">({money(f.recReal)} realizado)</span>}
              </Td>
              <Td className="text-right tnum">
                {money(sai)}
                {f.pagReal > 0 && <span className="ml-1 text-xs text-slate-500">({money(f.pagReal)} realizado)</span>}
              </Td>
              <Td className="w-48 min-w-40">
                <div className="space-y-1">
                  <Barra valor={ent} max={max} cor="bg-teal-600" />
                  <Barra valor={sai} max={max} cor="bg-violet-500" />
                </div>
              </Td>
              <Td className={`text-right tnum ${f.saldoPeriodo < 0 ? "text-rose-600" : ""}`}>{money(f.saldoPeriodo)}</Td>
              <Td className={`text-right font-medium tnum ${f.acumulado < 0 ? "text-rose-600" : ""}`}>{money(f.acumulado)}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
