import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td } from "@/components/ui";
import { num } from "@/lib/format";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function ConveniosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q, status } = await searchParams;
  const convenios = await db.convenio.findMany({
    where: {
      ...ativoWhere(status),
      ...(q
        ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { registroAns: { contains: q } }, { cnpj: { contains: q } }] }
        : {}),
    },
    include: { _count: { select: { cirurgias: true } } },
    orderBy: { nome: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Convênios" subtitle="Operadoras de planos de saúde" actions={<LinkButton href="/cadastros/convenios/novo">Novo convênio</LinkButton>} />
      <SearchBar placeholder="Nome, registro ANS ou CNPJ" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table head={["Nome", "Registro ANS", "CNPJ", "Cirurgias", ""]} empty={convenios.length === 0}>
        {convenios.map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <Td className="font-medium">
              {c.nome} {!c.ativo && <Badge>inativo</Badge>}
            </Td>
            <Td className="font-mono text-xs">{c.registroAns ?? "—"}</Td>
            <Td className="font-mono text-xs">{c.cnpj ?? "—"}</Td>
            <Td>{num(c._count.cirurgias)}</Td>
            <Td>
              <Link href={`/cadastros/convenios/${c.id}`} className="text-teal-700 hover:underline">Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
