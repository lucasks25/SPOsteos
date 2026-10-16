import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { Badge, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { date, diasAte, money, toNumber } from "@/lib/format";
import { Filtros, FiltroSelect } from "@/components/filtros";
import { nomeHospital, opcoesHospitais } from "@/app/(app)/cadastros/_lib/publico";

const STATUS = ["RASCUNHO", "ENVIADO", "APROVADO", "RECUSADO"] as const;

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ status?: string; hospital?: string }> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const [orcs, hospitais] = await Promise.all([
    db.orcamento.findMany({
      where: {
        ...(sp.status && (STATUS as readonly string[]).includes(sp.status) ? { status: sp.status as (typeof STATUS)[number] } : {}),
        ...(sp.hospital ? { hospitalId: sp.hospital } : {}),
      },
      include: { hospital: true, convenio: true, itens: true },
      orderBy: { id: "desc" },
      take: 200,
    }),
    opcoesHospitais(false),
  ]);
  const total = (o: (typeof orcs)[number]) => o.itens.reduce((s, i) => s + i.quantidade * toNumber(i.precoUnit), 0);
  const soma = (st: string) => orcs.filter((o) => o.status === st).reduce((a, o) => a + total(o), 0);
  const qtd = (st: string) => orcs.filter((o) => o.status === st).length;
  const vencendo = orcs.filter((o) => o.status === "ENVIADO" && o.validade && diasAte(o.validade) >= 0 && diasAte(o.validade) <= 7);
    return (
    <>
      <PageHeader title="Orçamentos" subtitle="Propostas de materiais para hospitais e convênios." actions={<LinkButton href="/comercial/orcamentos/novo" icon="mais">Novo orçamento</LinkButton>} />
      <KpiGrid>
        <Stat label="Na lista" value={money(orcs.reduce((a, o) => a + total(o), 0))} hint={`${orcs.length} orçamento(s)`} />
        <Stat label="Enviados (aguardando)" value={money(soma("ENVIADO"))} hint={<span className="text-sky-700">{qtd("ENVIADO")} proposta(s)</span>} />
        <Stat label="Aprovados" value={money(soma("APROVADO"))} hint={<span className="text-emerald-700">{qtd("APROVADO")} proposta(s)</span>} />
        <Stat label="Vencem em 7 dias" value={vencendo.length} hint={<span className={vencendo.length ? "text-amber-700" : undefined}>{money(vencendo.reduce((a, o) => a + total(o), 0))}</span>} tone={vencendo.length ? "warn" : "default"} />
      </KpiGrid>
      <Filtros limparHref="/comercial/orcamentos">
        <FiltroSelect label="Status" name="status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} defaultValue={sp.status} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={sp.hospital} />
      </Filtros>
      <Table
        titulo="Orçamentos"
        icone="documento"
        contagem={orcs.length}
        head={["Número", "Cliente", "Paciente", "Valor", "Validade", "Situação", "Ações"]}
        empty={orcs.length === 0}
        emptyText="Nenhum orçamento encontrado para os filtros informados."
        emptyAction={<LinkButton href="/comercial/orcamentos/novo" variant="secondary">Criar orçamento</LinkButton>}
      >
        {orcs.map((o) => {
          const d = o.validade ? diasAte(o.validade) : null;
          const aberto = o.status === "ENVIADO" || o.status === "RASCUNHO";
          return (
            <tr key={o.id}>
              <Td>
                <Link href={`/comercial/orcamentos/${o.id}`} className="font-mono text-xs font-semibold text-teal-700 hover:underline">ORC-{o.id}</Link>
                <div className="text-[11px] text-slate-500">{date(o.criadoEm)}</div>
              </Td>
              <Td>
                <div className="font-medium text-teal-700">{nomeHospital(o.hospital)}</div>
                <div className="text-xs text-slate-500">{o.convenio?.nome ?? "Particular"} · {o.itens.length} item(ns)</div>
              </Td>
              <Td>{o.paciente ?? "—"}</Td>
              <Td className="tnum text-right font-semibold">{money(total(o))}</Td>
              <Td>
                {o.validade ? date(o.validade) : "—"}
                {aberto && d !== null && d < 0 && <> <Badge color="red">vencida</Badge></>}
                {o.status === "ENVIADO" && d !== null && d >= 0 && d <= 7 && <> <Badge color="yellow">{d}d</Badge></>}
              </Td>
              <Td><StatusBadge status={o.status} /></Td>
              <Td><LinkButton href={`/comercial/orcamentos/${o.id}`} variant="small">Abrir</LinkButton></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
