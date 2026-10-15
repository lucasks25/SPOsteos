import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { num } from "@/lib/format";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function MedicosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q, status } = await searchParams;
  const medicos = await db.medico.findMany({
    where: {
      ...ativoWhere(status),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { crm: { contains: q } },
              { especialidade: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { cirurgias: true } } },
    orderBy: { nome: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Médicos" subtitle="Cirurgiões e solicitantes de materiais" actions={<LinkButton href="/cadastros/medicos/novo">Novo médico</LinkButton>} />
      <KpiGrid cols={3}>
        <Stat label="Listados" value={medicos.length} />
        <Stat label="Cirurgias" value={num(medicos.reduce((s, m) => s + m._count.cirurgias, 0))} hint="dos médicos listados" />
        <Stat label="Inativos" value={medicos.filter((m) => !m.ativo).length} hint="na lista atual" />
      </KpiGrid>
      <SearchBar placeholder="Nome, CRM ou especialidade" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table titulo="Médicos" icone="medico" contagem={medicos.length} head={["Médico", "Especialidade", "Contato", "Cirurgias", ""]} empty={medicos.length === 0} emptyText={q ? "Nenhum médico encontrado para essa busca." : "Nenhum médico encontrado."} emptyAction={<LinkButton href="/cadastros/medicos/novo" variant="secondary" icon="mais">Cadastrar médico</LinkButton>}>
        {medicos.map((m) => (
          <tr key={m.id}>
            <Td>
              <Link href={`/cadastros/medicos/${m.id}`} className="font-medium text-teal-700 hover:underline">{m.nome}</Link> {!m.ativo && <Badge>inativo</Badge>}
              <div className="text-xs text-slate-500">CRM <span className="font-mono">{m.crm}/{m.ufCrm}</span></div>
            </Td>
            <Td>{m.especialidade ?? "—"}</Td>
            <Td>
              <div>{m.telefone ?? "—"}</div>
              {m.email && <div className="text-xs text-slate-500">{m.email}</div>}
            </Td>
            <Td className="text-right">{num(m._count.cirurgias)}</Td>
            <Td>
              <Link href={`/cadastros/medicos/${m.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
