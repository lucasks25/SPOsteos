import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn } from "@/components/ui";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function HospitaisPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const { q, status } = await searchParams;
  const hospitais = await db.hospital.findMany({
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
    include: { tabelaPreco: { select: { nome: true } } },
    orderBy: { razaoSocial: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Hospitais" subtitle="Clientes e locais de consignação" actions={<LinkButton href="/cadastros/hospitais/novo">Novo hospital</LinkButton>} />
      <SearchBar placeholder="Razão social, fantasia, CNPJ ou cidade" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table head={["Hospital", "CNPJ", "Cidade/UF", "Prazo pgto.", "Tabela de preço", ""]} empty={hospitais.length === 0} emptyText={q ? "Nenhum hospital encontrado para essa busca." : "Nenhum hospital encontrado."} emptyAction={<LinkButton href="/cadastros/hospitais/novo" variant="secondary" icon="mais">Cadastrar hospital</LinkButton>}>
        {hospitais.map((h) => (
          <tr key={h.id}>
            <Td>
              <div className="font-medium">
                {h.nomeFantasia ?? h.razaoSocial} {!h.ativo && <Badge>inativo</Badge>}
              </div>
              {h.nomeFantasia && <div className="text-xs text-slate-500">{h.razaoSocial}</div>}
            </Td>
            <Td className="font-mono text-xs">{h.cnpj}</Td>
            <Td>{[h.cidade, h.uf].filter(Boolean).join("/") || "—"}</Td>
            <Td className="text-right">{h.prazoPagamentoDias} dias</Td>
            <Td>{h.tabelaPreco?.nome ?? "—"}</Td>
            <Td>
              <Link href={`/cadastros/hospitais/${h.id}`} className={btn.small}>Abrir</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
