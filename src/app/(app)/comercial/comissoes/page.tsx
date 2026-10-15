import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { money, num, toNumber } from "@/lib/format";
import { Filtros, FiltroInput, FiltroSelect } from "../_components/filtros";
import { diaSP, periodo } from "../_lib/datas";
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

  const tabela = (linhas: Linha[], titulo: string) => (
    <Table head={[titulo, "Pedidos", "Vendido", "Custo", "Margem (R$)", "Margem %", "Comissão"]} empty={linhas.length === 0} emptyText="Nenhum pedido faturado no período selecionado.">
      {linhas.map((l) => (
        <tr key={l.nome}>
          <Td className="font-medium">{l.nome}</Td>
          <Td className="text-right">{num(l.pedidos)}</Td>
          <Td className="text-right">{money(l.total)}</Td>
          <Td className="text-right">{money(l.custo)}</Td>
          <Td className="text-right">{money(l.total - l.custo)}</Td>
          <Td className="text-right">{pct(l.total - l.custo, l.total)}</Td>
          <Td className="text-right font-semibold">{money(l.comissao)}</Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title="Comissões e margem" subtitle="Pedidos de venda faturados no período (data da NF)" />
      <Filtros limparHref="/comercial/comissoes">
        <FiltroInput label="De" name="de" type="date" defaultValue={de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={ate} />
        <FiltroSelect label="Representante" name="representante" options={representantes} defaultValue={sp.representante} />
      </Filtros>
      <KpiGrid>
        <Stat label="Vendido" value={money(tot.total)} hint={`${pedidos.length} pedido(s)`} />
        <Stat label="Custo" value={money(tot.custo)} />
        <Stat label="Margem de contribuição" value={money(margem)} hint={pct(margem, tot.total)} tone={margem < 0 ? "danger" : "default"} />
        <Stat label="Comissões" value={money(tot.comissao)} />
      </KpiGrid>
      <div className="space-y-6">
        <Card title="Por representante">{tabela(porRep, "Representante")}</Card>
        <Card title="Vendas por hospital">{tabela(porHospital, "Hospital")}</Card>
        <Card title="Cirurgias por médico (no período)">
          <Table head={["Médico", "Realizadas/faturadas", "Agendadas/confirmadas", "Total"]} empty={porMedico.size === 0} emptyText="Nenhuma cirurgia no período selecionada.">
            {[...porMedico.values()].sort((a, b) => b.realizadas + b.agendadas - (a.realizadas + a.agendadas)).map((m) => (
              <tr key={m.nome}>
                <Td className="font-medium">{m.nome}</Td>
                <Td className="text-right">{num(m.realizadas)}</Td>
                <Td className="text-right">{num(m.agendadas)}</Td>
                <Td className="text-right font-semibold">{num(m.realizadas + m.agendadas)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-slate-600">
            Ver cirurgias em <Link href="/comercial/cirurgias" className="text-teal-700 hover:underline">Cirurgias</Link>.
          </p>
        </Card>
      </div>
    </>
  );
}
