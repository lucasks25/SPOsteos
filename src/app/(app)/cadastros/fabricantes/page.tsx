import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, SearchBar, Table, Td } from "@/components/ui";
import { num } from "@/lib/format";

export default async function FabricantesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const fabricantes = await db.fabricante.findMany({
    where: q
      ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { cnpj: { contains: q } }, { pais: { contains: q, mode: "insensitive" } }] }
      : undefined,
    include: { _count: { select: { produtos: true } } },
    orderBy: { nome: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Fabricantes" subtitle="Fabricantes dos materiais OPME" actions={<LinkButton href="/cadastros/fabricantes/novo">Novo fabricante</LinkButton>} />
      <SearchBar placeholder="Nome, CNPJ ou país" defaultValue={q} />
      <Table head={["Nome", "CNPJ", "País", "Produtos", ""]} empty={fabricantes.length === 0}>
        {fabricantes.map((f) => (
          <tr key={f.id} className="hover:bg-slate-50">
            <Td className="font-medium">{f.nome}</Td>
            <Td>{f.cnpj ?? "—"}</Td>
            <Td>{f.pais ?? "—"}</Td>
            <Td>{num(f._count.produtos)}</Td>
            <Td>
              <Link href={`/cadastros/fabricantes/${f.id}`} className="text-teal-700 hover:underline">Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
