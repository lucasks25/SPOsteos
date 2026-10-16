import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_SUPRIMENTOS } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { num } from "@/lib/format";

export default async function FabricantesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_SUPRIMENTOS);
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
      <PageHeader title="Fabricantes" subtitle="Quem fabrica os materiais que vendemos; Compras, Estoque e Qualidade mantêm a lista." actions={edita ? <LinkButton href="/cadastros/fabricantes/novo">Novo fabricante</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat icon="lista" label="Listados" value={fabricantes.length} />
        <Stat icon="pacote" label="Produtos" value={num(fabricantes.reduce((s, f) => s + f._count.produtos, 0))} hint="dos fabricantes listados" />
        <Stat icon="documento" label="Sem CNPJ" value={fabricantes.filter((f) => !f.cnpj).length} hint="cadastro incompleto" />
      </KpiGrid>
      <SearchBar placeholder="Nome, CNPJ ou país" defaultValue={q} />
      <Table titulo="Fabricantes" icone="predio" contagem={fabricantes.length} head={["Nome", "CNPJ", "País", "Produtos", ""]} empty={fabricantes.length === 0} emptyText={q ? "Nenhum fabricante encontrado para essa busca." : "Nenhum fabricante encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/fabricantes/novo" variant="secondary" icon="mais">Cadastrar fabricante</LinkButton> : undefined}>
        {fabricantes.map((f) => (
          <tr key={f.id}>
            <Td className="font-medium">{f.nome}</Td>
            <Td>{f.cnpj ?? "—"}</Td>
            <Td>{f.pais ?? "—"}</Td>
            <Td className="text-right">{num(f._count.produtos)}</Td>
            <Td>
              <Link href={`/cadastros/fabricantes/${f.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
