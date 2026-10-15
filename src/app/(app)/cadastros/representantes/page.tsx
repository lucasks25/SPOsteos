import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn } from "@/components/ui";
import { num } from "@/lib/format";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function RepresentantesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q, status } = await searchParams;
  const reps = await db.representante.findMany({
    where: { ...ativoWhere(status), ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}) },
    include: { _count: { select: { cirurgias: true, pedidos: true } } },
    orderBy: { nome: "asc" },
  });
  return (
    <>
      <PageHeader title="Representantes" subtitle="Equipe comercial e comissões" actions={<LinkButton href="/cadastros/representantes/novo">Novo representante</LinkButton>} />
      <SearchBar placeholder="Nome" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table head={["Nome", "Contato", "Comissão", "Cirurgias", "Pedidos", ""]} empty={reps.length === 0} emptyText={q ? "Nenhum representante encontrado para essa busca." : "Nenhum representante encontrado."} emptyAction={<LinkButton href="/cadastros/representantes/novo" variant="secondary" icon="mais">Cadastrar representante</LinkButton>}>
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
