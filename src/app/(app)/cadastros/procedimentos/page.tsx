import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, SearchBar, Table, Td } from "@/components/ui";
import { num } from "@/lib/format";

export default async function ProcedimentosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const procs = await db.procedimento.findMany({
    where: q
      ? { OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigoTuss: { contains: q } }, { especialidade: { contains: q, mode: "insensitive" } }] }
      : undefined,
    include: { _count: { select: { itens: true, cirurgias: true } } },
    orderBy: { descricao: "asc" },
  });
  return (
    <>
      <PageHeader title="Procedimentos" subtitle="Perfis de procedimento com os materiais padrão de cada cirurgia" actions={<LinkButton href="/cadastros/procedimentos/novo">Novo procedimento</LinkButton>} />
      <SearchBar placeholder="Descrição, TUSS ou especialidade" defaultValue={q} />
      <Table head={["TUSS", "Descrição", "Especialidade", "Materiais", "Cirurgias", ""]} empty={procs.length === 0}>
        {procs.map((p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <Td className="font-mono text-xs">{p.codigoTuss ?? "—"}</Td>
            <Td className="font-medium">{p.descricao}</Td>
            <Td>{p.especialidade ?? "—"}</Td>
            <Td>{num(p._count.itens)}</Td>
            <Td>{num(p._count.cirurgias)}</Td>
            <Td>
              <Link href={`/cadastros/procedimentos/${p.id}`} className="text-teal-700 hover:underline">Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
