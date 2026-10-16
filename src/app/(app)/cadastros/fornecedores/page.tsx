import Link from "next/link";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { PERFIS_FORNECEDOR } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_FORNECEDOR);
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
      <PageHeader title="Fornecedores" subtitle="De quem compramos os materiais; mantido pelo setor de Compras (dados de pagamento ficam no Financeiro)." actions={edita ? <LinkButton href="/cadastros/fornecedores/novo">Novo fornecedor</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat label="Listados" value={fornecedores.length} />
        <Stat label="Sem AFE" value={fornecedores.filter((f) => !f.afe).length} hint="autorização pendente" />
        <Stat label="Inativos" value={fornecedores.filter((f) => !f.ativo).length} hint="na lista atual" />
      </KpiGrid>
      <SearchBar placeholder="Razão social, fantasia, CNPJ ou cidade" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table titulo="Fornecedores" icone="caminhao" contagem={fornecedores.length} head={["Razão social", "CNPJ", "Contato", "Cidade/UF", "AFE", ""]} empty={fornecedores.length === 0} emptyText={q ? "Nenhum fornecedor encontrado para essa busca." : "Nenhum fornecedor encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/fornecedores/novo" variant="secondary" icon="mais">Cadastrar fornecedor</LinkButton> : undefined}>
        {fornecedores.map((f) => (
          <tr key={f.id}>
            <Td>
              <div className="font-medium text-teal-700">
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
              <Link href={`/cadastros/fornecedores/${f.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
