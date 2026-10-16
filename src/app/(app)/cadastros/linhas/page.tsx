import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { num } from "@/lib/format";
import { ativoWhere, StatusFilter } from "../_lib/status-filter";
import { soStrings } from "@/lib/search-params";

export default async function LinhasPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_PRODUTO);
  const { q, status } = soStrings(await searchParams);
  const linhas = await db.linhaProduto.findMany({
    where: {
      ...ativoWhere(status),
      ...(q ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }, { grupo: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { _count: { select: { produtos: true } } },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader title="Linhas de produto" subtitle="Agrupam os produtos para acompanhar vendas, margem e comissão por linha (coluna, dor, endoscopia, biológicos, instrumentais)." actions={edita ? <LinkButton href="/cadastros/linhas/novo">Nova linha</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat label="Listadas" value={linhas.length} />
        <Stat label="Produtos" value={num(linhas.reduce((s, l) => s + l._count.produtos, 0))} hint="nas linhas listadas" />
        <Stat label="Inativas" value={linhas.filter((l) => !l.ativo).length} hint="na lista atual" />
      </KpiGrid>
      <SearchBar placeholder="Código, nome ou grupo" defaultValue={q}>
        <StatusFilter value={status} />
      </SearchBar>
      <Table titulo="Linhas" contagem={linhas.length} head={["Linha", "Grupo", "Ordem", "Produtos", ""]} empty={linhas.length === 0} emptyText={q ? "Nenhuma linha encontrada para essa busca." : "Nenhuma linha encontrada."} emptyAction={edita ? <LinkButton href="/cadastros/linhas/novo" variant="secondary" icon="mais">Cadastrar linha</LinkButton> : undefined}>
        {linhas.map((l) => (
          <tr key={l.id}>
            <Td>
              <span className="font-medium">{l.nome}</span> {!l.ativo && <Badge>inativa</Badge>}
              <div className="font-mono text-xs text-slate-500">{l.codigo}</div>
            </Td>
            <Td>{l.grupo}</Td>
            <Td className="tnum text-right">{l.ordem}</Td>
            <Td className="tnum text-right">{num(l._count.produtos)}</Td>
            <Td>
              <Link href={`/cadastros/linhas/${l.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
