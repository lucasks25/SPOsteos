import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { num } from "@/lib/format";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";
import { soStrings } from "@/lib/search-params";

export default async function RepresentantesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_COMERCIAL);
  const { q, status } = soStrings(await searchParams);
  const reps = await db.representante.findMany({
    where: { ...ativoWhere(status), ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}) },
    include: { _count: { select: { cirurgias: true, pedidos: true } } },
    orderBy: { nome: "asc" },
  });
  return (
    <>
      <PageHeader title="Representantes" subtitle="Representantes comerciais e o percentual de comissão de cada um." actions={edita ? <LinkButton href="/cadastros/representantes/novo">Novo representante</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat label="Listados" value={reps.length} />
        <Stat label="Cirurgias" value={num(reps.reduce((s, r) => s + r._count.cirurgias, 0))} hint="dos representantes listados" />
        <Stat label="Inativos" value={reps.filter((r) => !r.ativo).length} hint="na lista atual" />
      </KpiGrid>
      <SearchBar placeholder="Nome" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table titulo="Representantes" contagem={reps.length} head={["Nome", "Contato", "Comissão", "Cirurgias", "Pedidos", ""]} empty={reps.length === 0} emptyText={q ? "Nenhum representante encontrado para essa busca." : "Nenhum representante encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/representantes/novo" variant="secondary" icon="mais">Cadastrar representante</LinkButton> : undefined}>
        {reps.map((r) => (
          <tr key={r.id}>
            <Td className="font-medium">
              {r.nome} {!r.ativo && <Badge>inativo</Badge>}
            </Td>
            <Td>
              <div>{r.telefone ?? "—"}</div>
              {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
            </Td>
            <Td className="text-right">{r.comissaoPercent.toString()}%</Td>
            <Td className="text-right">{num(r._count.cirurgias)}</Td>
            <Td className="text-right">{num(r._count.pedidos)}</Td>
            <Td>
              <Link href={`/cadastros/representantes/${r.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
