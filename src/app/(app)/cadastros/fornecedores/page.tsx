import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td } from "@/components/ui";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q, status } = await searchParams;
  const fornecedores = await db.fornecedor.findMany({
    where: {
      ...ativoWhere(status),
      ...(q
        ? {
            OR: [
              { razaoSocial: { contains: q, mode: "insensitive" } },
              { nomeFantasia: { contains: q, mode: "insensitive" } },
              { cnpj: { contains: q } },
              { cidade: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { razaoSocial: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Fornecedores" subtitle="Fornecedores e importadores de materiais" actions={<LinkButton href="/cadastros/fornecedores/novo">Novo fornecedor</LinkButton>} />
      <SearchBar placeholder="Razão social, fantasia, CNPJ ou cidade" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table head={["Razão social", "CNPJ", "Contato", "Cidade/UF", "AFE", ""]} empty={fornecedores.length === 0}>
        {fornecedores.map((f) => (
          <tr key={f.id} className="hover:bg-slate-50">
            <Td>
              <div className="font-medium">
                {f.razaoSocial} {!f.ativo && <Badge>inativo</Badge>}
              </div>
              {f.nomeFantasia && <div className="text-xs text-slate-500">{f.nomeFantasia}</div>}
            </Td>
            <Td className="font-mono text-xs">{f.cnpj}</Td>
            <Td>
              <div>{f.telefone ?? "—"}</div>
              {f.email && <div className="text-xs text-slate-500">{f.email}</div>}
            </Td>
            <Td>{[f.cidade, f.uf].filter(Boolean).join("/") || "—"}</Td>
            <Td>{f.afe ? f.afe : <Badge color="yellow">sem AFE</Badge>}</Td>
            <Td>
              <Link href={`/cadastros/fornecedores/${f.id}`} className="text-teal-700 hover:underline">Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
