import Link from "next/link";
import { Fragment } from "react";
import { Card, PageHeader, Table, Td, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { addMeses, hojeUTC, inicioMes, mesAno } from "../_lib/datas";
import { dreDoMes, dreTotal, mesesDe, type DreMes, type TipoPlano } from "../_lib/dre";
import { carregarLinhasDre } from "../_lib/dre-dados";

const NUM_MESES = 6;

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const cor = (v: number) => (v < 0 ? "text-rose-700" : "text-slate-800");

type Def = { rotulo: string; campo: keyof DreMes; tipo?: TipoPlano; forte?: boolean };
// campos de subtotal em negrito; linhas com `tipo` abrem o detalhe por conta do plano
const LINHAS: Def[] = [
  { rotulo: "Receita bruta", campo: "receitaBruta", tipo: "RECEITA" },
  { rotulo: "(−) Deduções", campo: "deducoes", tipo: "DEDUCAO" },
  { rotulo: "= Receita líquida", campo: "receitaLiquida", forte: true },
  { rotulo: "(−) Custo da mercadoria e perdas", campo: "custos", tipo: "CUSTO" },
  { rotulo: "= Lucro bruto", campo: "lucroBruto", forte: true },
  { rotulo: "(−) Despesas operacionais", campo: "despesas", tipo: "DESPESA" },
  { rotulo: "= Resultado operacional", campo: "resultadoOperacional", forte: true },
  { rotulo: "± Resultado financeiro", campo: "financeiro" },
  { rotulo: "= Resultado antes do IR/CSLL", campo: "resultadoAntesIr", forte: true },
  { rotulo: "(−) IRPJ e CSLL", campo: "impostoLucro", tipo: "IMPOSTO_LUCRO" },
  { rotulo: "Não classificado", campo: "naoClassificado" },
  { rotulo: "= Resultado líquido", campo: "resultadoLiquido", forte: true },
];

export default async function DrePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const ultimo = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hojeUTC().toISOString().slice(0, 7);
  const centroId = typeof sp.centro === "string" && sp.centro ? sp.centro : null;
  const fimDate = addMeses(new Date(`${ultimo}-01T00:00:00Z`), 1);
  const iniDate = addMeses(fimDate, -NUM_MESES);
  const meses = mesesDe(iniDate.toISOString().slice(0, 7), NUM_MESES);

  const [linhas, centros, planos, fechados] = await Promise.all([
    carregarLinhasDre(inicioMes(iniDate), fimDate, centroId),
    db.centroCusto.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    db.planoConta.findMany({ select: { id: true, codigo: true, nome: true } }),
    db.fechamentoMes.findMany({ select: { mes: true } }).then((l) => new Set(l.map((f) => f.mes))),
  ]);
  const nomePlano = new Map(planos.map((p) => [p.id, `${p.codigo} — ${p.nome}`]));
  const colunas = [...meses.map((m) => dreDoMes(linhas, m)), dreTotal(linhas, meses)];
  const semClass = colunas.slice(0, -1).some((c) => c.naoClassificado !== 0);
  const anterior = addMeses(new Date(`${ultimo}-01T00:00:00Z`), -1).toISOString().slice(0, 7);
  const proximo = fimDate.toISOString().slice(0, 7);
  const qs = (m: string) => `?mes=${m}${centroId ? `&centro=${centroId}` : ""}`;

  return (
    <>
      <PageHeader title="DRE gerencial" subtitle="Resultado por competência (não é o caixa). Receita e despesa entram na data de competência do título." />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/financeiro/dre${qs(anterior)}`} className="text-teal-700 hover:underline">← mês anterior</Link>
        <Link href={`/financeiro/dre${qs(proximo)}`} className="text-teal-700 hover:underline">próximo mês →</Link>
        <form className="flex items-center gap-2">
          <input type="month" name="mes" defaultValue={ultimo} className="rounded-lg border border-slate-300 px-2 py-1" />
          <select name="centro" defaultValue={centroId ?? ""} className="rounded-lg border border-slate-300 px-2 py-1">
            <option value="">Todos os centros de custo</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
            ))}
          </select>
          <button className="rounded-lg bg-teal-700 px-3 py-1 text-white">Ver</button>
        </form>
      </div>

      {semClass && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Há lançamentos sem conta do plano. Eles somam no resultado na linha “Não classificado”; classifique-os em <Link href="/financeiro/classificar" className="underline">Classificar pendentes</Link>.
        </p>
      )}
      {centroId && <p className="mb-3 text-xs text-slate-500">Com o filtro de centro de custo, perdas e ajustes de estoque ficam de fora (o estoque não tem centro de custo).</p>}

      <Table head={["", ...meses.map((m) => mesAno(new Date(`${m}-01T00:00:00Z`)) + (fechados.has(m) ? " (fechado)" : "")), "Total"]}>
        {LINHAS.map((def) => {
          const detalhes = def.tipo ? colunas.map((c) => c.contas[def.tipo!] ?? []) : [];
          const ids = [...new Set(detalhes.flat().map((c) => c.planoId))];
          return (
            <Fragment key={def.campo}>
              <tr className={cx(def.forte && "bg-slate-50 font-semibold")}>
                <Td>{def.rotulo}</Td>
                {colunas.map((c, i) => (
                  <Td key={i} className={cx("text-right tabular-nums", cor(c[def.campo] as number))}>{money(c[def.campo] as number)}</Td>
                ))}
              </tr>
              {def.campo === "lucroBruto" && (
                <tr className="text-xs text-slate-500">
                  <Td className="pl-8">Margem bruta</Td>
                  {colunas.map((c, i) => (
                    <Td key={i} className="text-right">{pct(c.margemBruta)}</Td>
                  ))}
                </tr>
              )}
              {ids.map((id) => (
                <tr key={`${def.campo}-${id}`} className="text-xs text-slate-500">
                  <Td className="pl-8">{id ? (nomePlano.get(id) ?? "Conta removida") : "Sem conta do plano"}</Td>
                  {colunas.map((_, i) => {
                    const v = detalhes[i].find((c) => c.planoId === id)?.valor ?? 0;
                    return <Td key={i} className="text-right tabular-nums">{v === 0 ? "—" : money(v)}</Td>;
                  })}
                </tr>
              ))}
            </Fragment>
          );
        })}
      </Table>
      <Card className="mt-4">
        <p className="text-xs text-slate-500">
          Custo da mercadoria = custo médio congelado no faturamento de cada pedido. Compras de mercadoria vão para o estoque (fora do resultado). Juros e multas pagos ou recebidos e descontos obtidos ou concedidos entram no resultado financeiro, na data da baixa.
        </p>
      </Card>
    </>
  );
}
