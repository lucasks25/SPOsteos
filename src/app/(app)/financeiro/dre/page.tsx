import Link from "next/link";
import { Fragment } from "react";
import { Field, Select } from "@/components/form";
import { Card, FilterBar, PageHeader, Table, Td, btn, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { addMeses, hojeUTC, inicioMes, mesAno } from "@/lib/datas";
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
      <PageHeader title="DRE gerencial" subtitle="Resultado por competência, não é o caixa: receita e despesa entram na data de competência do título." />
      <FilterBar>
        <Field label="Último mês exibido" name="mes" type="month" defaultValue={ultimo} className="w-44" />
        <Select label="Centro de custo" name="centro" defaultValue={centroId ?? ""} options={centros.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))} placeholder="Todos os centros de custo" className="w-64" />
        <button className={btn.secondary}>Ver</button>
        <Link href={`/financeiro/dre${qs(anterior)}`} className={btn.ghost}>← Mês anterior</Link>
        <Link href={`/financeiro/dre${qs(proximo)}`} className={btn.ghost}>Próximo mês →</Link>
      </FilterBar>

      {semClass && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Há lançamentos sem conta do plano. Eles somam no resultado na linha “Não classificado”; classifique-os em <Link href="/financeiro/classificar" className="font-semibold underline">Classificar pendentes</Link>.
        </p>
      )}
      {centroId && <p className="mb-3 text-xs text-slate-500">Com o filtro de centro de custo, perdas e ajustes de estoque ficam de fora (o estoque não tem centro de custo).</p>}

      <Table titulo="Resultado por competência" icone="tendencia" contagem={LINHAS.length} head={["Linha do resultado", ...meses.map((m) => mesAno(new Date(`${m}-01T00:00:00Z`)) + (fechados.has(m) ? " (fechado)" : "")), "Total"]}>
        {LINHAS.map((def) => {
          const detalhes = def.tipo ? colunas.map((c) => c.contas[def.tipo!] ?? []) : [];
          const ids = [...new Set(detalhes.flat().map((c) => c.planoId))];
          return (
            <Fragment key={def.campo}>
              <tr className={cx(def.forte && "bg-slate-50 font-semibold")}>
                <Td>{def.rotulo}</Td>
                {colunas.map((c, i) => (
                  <Td key={i} className={cx("text-right tnum", cor(c[def.campo] as number))}>{money(c[def.campo] as number)}</Td>
                ))}
              </tr>
              {def.campo === "lucroBruto" && (
                <tr className="text-xs text-slate-500">
                  <Td className="pl-8">Margem bruta</Td>
                  {colunas.map((c, i) => (
                    <Td key={i} className="text-right tnum">{pct(c.margemBruta)}</Td>
                  ))}
                </tr>
              )}
              {ids.map((id) => (
                <tr key={`${def.campo}-${id}`} className="text-xs text-slate-500">
                  <Td className="pl-8">{id ? (nomePlano.get(id) ?? "Conta removida") : "Sem conta do plano"}</Td>
                  {colunas.map((_, i) => {
                    const v = detalhes[i].find((c) => c.planoId === id)?.valor ?? 0;
                    return <Td key={i} className="text-right tnum">{v === 0 ? "—" : money(v)}</Td>;
                  })}
                </tr>
              ))}
            </Fragment>
          );
        })}
      </Table>
      <Card className="mt-3" title="Como ler" icon="info">
        <p className="text-xs text-slate-500">
          Custo da mercadoria = custo médio congelado no faturamento de cada pedido. Compras de mercadoria vão para o estoque (fora do resultado). Juros e multas pagos ou recebidos e descontos obtidos ou concedidos entram no resultado financeiro, na data da baixa.
        </p>
      </Card>
    </>
  );
}
