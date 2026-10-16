import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { Filtros, FiltroSelect } from "@/components/filtros";
import { date, num } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_VER_RECOLHIMENTO, ROTULO_ORIGEM, docRecolhimento, encerrado, podeOperarRecolhimento, podeVerPacientes, prazoVencido, resumirRecolhimento, type StatusRecolhimento } from "../_lib/recolhimento";
import { situacaoAlvos } from "../_lib/recolhimento-servico";

const STATUS: StatusRecolhimento[] = ["ABERTO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"];

export default async function RecolhimentosPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser(PERFIS_VER_RECOLHIMENTO);
  const sp = await searchParams;
  const status = STATUS.includes(sp.status as StatusRecolhimento) ? (sp.status as StatusRecolhimento) : undefined;
  const verPac = podeVerPacientes(user.perfil);
  const hoje = hojeUTC();

  const [lista, ativos] = await Promise.all([
    db.recolhimento.findMany({
      where: status ? { status } : {},
      include: { lotes: { include: { lote: { select: { numero: true, produto: { select: { descricao: true } } } } } } },
      orderBy: { id: "desc" },
      take: 200,
    }),
    db.recolhimento.findMany({ where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } }, select: { id: true, prazo: true, status: true } }),
  ]);
  // unidades a recolher e pacientes por recolhimento (só dos exibidos que estão em andamento)
  const resumos = new Map<number, ReturnType<typeof resumirRecolhimento>>();
  for (const r of lista) {
    const [{ itens }, pacientes] = await Promise.all([
      situacaoAlvos(db, r.id),
      verPac ? db.recolhimentoPaciente.findMany({ where: { recolhimentoId: r.id }, select: { comunicadoEm: true } }) : Promise.resolve([]),
    ]);
    resumos.set(r.id, resumirRecolhimento(itens.map((i) => i.calc), pacientes));
  }
  let aRecolherTotal = 0;
  for (const a of ativos) aRecolherTotal += resumos.get(a.id)?.aRecolher ?? (await situacaoAlvos(db, a.id)).itens.reduce((v, i) => v + i.falta, 0);
  const pacientesAComunicar = verPac
    ? await db.recolhimentoPaciente.count({ where: { comunicadoEm: null, recolhimento: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } } } })
    : null;
  const vencidos = ativos.filter((a) => prazoVencido(a.prazo, a.status, hoje)).length;

  return (
    <>
      <PageHeader
        title="Recolhimento de lote / tecnovigilância"
        subtitle="Para a Qualidade (o Estoque recolhe o material): bloqueio do lote, material nos locais e hospitais, pacientes afetados, comunicados e relatório final."
        actions={podeOperarRecolhimento(user.perfil) && <LinkButton href="/qualidade/recolhimentos/novo" icon="mais">Novo recolhimento</LinkButton>}
      />
      <KpiGrid cols={4}>
        <Stat label="Recolhimentos abertos" value={num(ativos.length)} hint="em aberto ou em andamento" tone={ativos.length ? "warn" : "default"} />
        <Stat label="Vencidos no prazo" value={num(vencidos)} hint="prazo anterior a hoje" tone={vencidos ? "danger" : "default"} />
        <Stat label="Unidades a recolher" value={num(aRecolherTotal)} hint="saldo ainda nos locais" tone={aRecolherTotal ? "danger" : "default"} />
        <Stat label="Pacientes a comunicar" value={pacientesAComunicar === null ? "—" : num(pacientesAComunicar)} hint={pacientesAComunicar === null ? "visível só para Qualidade e Admin" : "cirurgias que usaram o lote"} tone={pacientesAComunicar ? "warn" : "default"} />
      </KpiGrid>
      <Filtros limparHref="/qualidade/recolhimentos">
        <FiltroSelect label="Situação" name="status" defaultValue={status} todos="Todas" options={STATUS.map((s) => ({ value: s, label: s.replaceAll("_", " ").toLowerCase() }))} />
      </Filtros>
      <Table
        titulo="Recolhimentos"
        icone="alerta"
        contagem={lista.length}
        head={["Nº", "Situação", "Origem", "Produto / lotes", "Motivo", "Prazo", "A recolher", ...(verPac ? ["Pacientes a comunicar"] : [])]}
        empty={lista.length === 0}
        emptyText="Nenhum recolhimento encontrado."
        emptyAction={podeOperarRecolhimento(user.perfil) ? <LinkButton href="/qualidade/recolhimentos/novo" icon="mais">Novo recolhimento</LinkButton> : undefined}
      >
        {lista.map((r) => {
          const res = resumos.get(r.id)!;
          const venc = prazoVencido(r.prazo, r.status, hoje);
          const produtos = [...new Set(r.lotes.map((l) => l.lote.produto.descricao))];
          return (
            <tr key={r.id}>
              <Td><Link href={`/qualidade/recolhimentos/${r.id}`} className="font-mono font-medium text-teal-700 hover:underline">{docRecolhimento(r.id)}</Link></Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td>
                <div>{ROTULO_ORIGEM[r.origem]}</div>
                <div className="text-[11px] text-slate-500">classe {r.classe}{r.referencia ? ` · ${r.referencia}` : ""}</div>
              </Td>
              <Td className="max-w-xs">
                <div className="truncate font-medium text-slate-900">{produtos[0]}{produtos.length > 1 ? ` (+${produtos.length - 1})` : ""}</div>
                <div className="truncate font-mono text-[11px] text-slate-500">lote {r.lotes.map((l) => l.lote.numero).join(", ")}</div>
              </Td>
              <Td className="max-w-xs truncate">{r.motivo}</Td>
              <Td>{r.prazo ? (venc ? <Badge color="red">{date(r.prazo)} · vencido</Badge> : date(r.prazo)) : "—"}</Td>
              <Td className="tnum text-right">{encerrado(r.status) ? "—" : num(res.aRecolher)}</Td>
              {verPac && <Td className="tnum text-right">{num(res.pacientesAComunicar)}</Td>}
            </tr>
          );
        })}
      </Table>
    </>
  );
}
