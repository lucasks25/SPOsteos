import Link from "next/link";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { PERFIS_HOSPITAL } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function HospitaisPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_HOSPITAL);
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
      <PageHeader title="Hospitais" subtitle="Hospitais clientes e seus locais de consignação; mantido pelo Comercial." actions={edita ? <LinkButton href="/cadastros/hospitais/novo">Novo hospital</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat icon="lista" label="Listados" value={hospitais.length} />
        <Stat icon="etiqueta" label="Com tabela de preço" value={hospitais.filter((h) => h.tabelaPreco).length} hint="preço negociado" />
        <Stat icon="alerta" label="Inativos" value={hospitais.filter((h) => !h.ativo).length} hint="na lista atual" />
      </KpiGrid>
      <SearchBar placeholder="Razão social, fantasia, CNPJ ou cidade" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table titulo="Hospitais" icone="predio" contagem={hospitais.length} head={["Hospital", "CNPJ", "Cidade/UF", "Prazo pgto.", "Tabela de preço", ""]} empty={hospitais.length === 0} emptyText={q ? "Nenhum hospital encontrado para essa busca." : "Nenhum hospital encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/hospitais/novo" variant="secondary" icon="mais">Cadastrar hospital</LinkButton> : undefined}>
        {hospitais.map((h) => (
          <tr key={h.id}>
            <Td>
              <div className="font-medium text-teal-700">
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
