import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KpiGrid, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { money, num, toNumber } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "../_components/filtros";
import { diaSP, periodo } from "@/lib/datas";
import { nomeHospital, opcoesRepresentantes } from "../_lib/opcoes";

type Linha = { nome: string; pedidos: number; total: number; custo: number; comissao: number };
const pct = (m: number, t: number) => (t > 0 ? `${((m / t) * 100).toFixed(1)}%` : "—");

export default async function ComissoesPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; representante?: string }> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const hoje = diaSP(new Date());
  const de = sp.de ?? `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate ?? hoje;
  const intervalo = periodo(de, ate);

  const [pedidos, cirurgias, representantes] = await Promise.all([
    db.pedidoVenda.findMany({
      where: { status: "FATURADO", faturadoEm: intervalo, ...(sp.representante ? { representanteId: sp.representante } : {}) },
      include: { representante: true, hospital: true },
    }),
    db.cirurgia.findMany({
      where: { dataHora: intervalo, status: { not: "CANCELADA" }, ...(sp.representante ? { representanteId: sp.representante } : {}) },
      include: { medico: true },
    }),
    opcoesRepresentantes(false),
  ]);

  const agrupar = (chave: (p: (typeof pedidos)[number]) => [string, string]) => {
    const m = new Map<string, Linha>();
    for (const p of pedidos) {
      const [k, nome] = chave(p);
      const l = m.get(k) ?? { nome, pedidos: 0, total: 0, custo: 0, comissao: 0 };
      l.pedidos += 1;
      l.total += toNumber(p.total);
      l.custo += toNumber(p.custoTotal);
      l.comissao += toNumber(p.comissao);
      m.set(k, l);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  };
  const porRep = agrupar((p) => [p.representanteId ?? "-", p.representante?.nome ?? "Sem representante"]);
  const porHospital = agrupar((p) => [p.hospitalId, nomeHospital(p.hospital)]);
  const porMedico = new Map<string, { nome: string; realizadas: number; agendadas: number }>();
  for (const c of cirurgias) {
    const l = porMedico.get(c.medicoId) ?? { nome: c.medico.nome, realizadas: 0, agendadas: 0 };
    if (["REALIZADA", "FATURADA"].includes(c.status)) l.realizadas += 1;
    else l.agendadas += 1;
    porMedico.set(c.medicoId, l);
  }

  const tot = porRep.reduce((a, l) => ({ total: a.total + l.total, custo: a.custo + l.custo, comissao: a.comissao + l.comissao }), { total: 0, custo: 0, comissao: 0 });
  const margem = tot.total - tot.custo;

  const tabela = (linhas: Linha[], titulo: string, rotulo: string, icone: "usuarios" | "predio") => (
    <Table
      titulo={titulo}
      icone={icone}
      contagem={linhas.length}
      head={[rotulo, "Pedidos", "Vendido", "Custo", "Margem (R$)", "Margem %", "Comissão"]}
      empty={linhas.length === 0}
      emptyText="Nenhum pedido faturado no período selecionado."
    >
      {linhas.map((l) => (
        <tr key={l.nome}>
          <Td>
            <div className="font-medium text-teal-700">{l.nome}</div>
            <div className="text-xs text-slate-500">{num(l.pedidos)} pedido(s) faturado(s)</div>
          </Td>
          <Td className="tnum text-right">{num(l.pedidos)}</Td>
          <Td className="tnum text-right">{money(l.total)}</Td>
          <Td className="tnum text-right">{money(l.custo)}</Td>
          <Td className={`tnum text-right ${l.total - l.custo < 0 ? "text-rose-600" : ""}`}>{money(l.total - l.custo)}</Td>
          <Td className="tnum text-right">{pct(l.total - l.custo, l.total)}</Td>
          <Td className="tnum text-right font-semibold">{money(l.comissao)}</Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title="Comissões e margem" subtitle="Pedidos de venda faturados no período (data da NF)" />
      <KpiGrid>
        <Stat label="Vendido" value={money(tot.total)} hint={`${pedidos.length} pedido(s)`} />
        <Stat label="Custo" value={money(tot.custo)} />
        <Stat label="Margem de contribuição" value={money(margem)} hint={<span className={margem < 0 ? "text-rose-600" : "text-emerald-700"}>{pct(margem, tot.total)}</span>} tone={margem < 0 ? "danger" : "default"} />
        <Stat label="Comissões" value={money(tot.comissao)} />
      </KpiGrid>
      <Filtros limparHref="/comercial/comissoes">
        <FiltroInput label="De" name="de" type="date" defaultValue={de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={ate} />
        <FiltroSelect label="Representante" name="representante" options={representantes} defaultValue={sp.representante} />
      </Filtros>
      <div className="space-y-3">
        {tabela(porRep, "Por representante", "Representante", "usuarios")}
        {tabela(porHospital, "Vendas por hospital", "Hospital", "predio")}
        <Table
          titulo="Cirurgias por médico (no período)"
          icone="medico"
          contagem={porMedico.size}
          acoes={<Link href="/comercial/cirurgias" className={btn.small}>Ver cirurgias</Link>}
          head={["Médico", "Realizadas/faturadas", "Agendadas/confirmadas", "Total"]}
          empty={porMedico.size === 0}
          emptyText="Nenhuma cirurgia no período selecionada."
        >
          {[...porMedico.values()].sort((a, b) => b.realizadas + b.agendadas - (a.realizadas + a.agendadas)).map((m) => (
            <tr key={m.nome}>
              <Td className="font-medium text-teal-700">{m.nome}</Td>
              <Td className="tnum text-right">{num(m.realizadas)}</Td>
              <Td className="tnum text-right">{num(m.agendadas)}</Td>
              <Td className="tnum text-right font-semibold">{num(m.realizadas + m.agendadas)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
