import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn } from "@/components/ui";
import { date, diasAte, money, num } from "@/lib/format";

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const produtos = await db.produto.findMany({
    where: q
      ? { OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }, { registroAnvisa: { contains: q } }, { gtin: { contains: q } }] }
      : undefined,
    include: { fabricante: true, saldos: { select: { quantidade: true } } },
    orderBy: { descricao: "asc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Produtos" subtitle="Materiais OPME, implantes e instrumentais" actions={<LinkButton href="/cadastros/produtos/novo">Novo produto</LinkButton>} />
      <SearchBar placeholder="Código, descrição, registro ANVISA ou GTIN" defaultValue={q} />
      <Table head={["Código", "Descrição", "Fabricante", "Registro ANVISA", "Venc. registro", "Preço base", "Estoque", ""]} empty={produtos.length === 0} emptyText={q ? "Nenhum produto encontrado para essa busca." : "Nenhum produto encontrado."} emptyAction={<LinkButton href="/cadastros/produtos/novo" variant="secondary" icon="mais">Cadastrar produto</LinkButton>}>
        {produtos.map((p) => {
          const estoque = p.saldos.reduce((s, x) => s + x.quantidade, 0);
          const dias = p.validadeRegistro ? diasAte(p.validadeRegistro) : null;
          return (
            <tr key={p.id}>
              <Td className="font-mono text-xs">{p.codigo}</Td>
              <Td>
                {p.descricao} {!p.ativo && <Badge>inativo</Badge>}
              </Td>
              <Td>{p.fabricante?.nome ?? "—"}</Td>
              <Td>{p.registroAnvisa ?? "—"}</Td>
              <Td>
                {date(p.validadeRegistro)}{" "}
                {dias !== null && dias < 0 && <Badge color="red">vencido</Badge>}
                {dias !== null && dias >= 0 && dias <= 90 && <Badge color="yellow">{dias}d</Badge>}
              </Td>
              <Td className="text-right">{money(p.precoBase)}</Td>
              <Td className="text-right">
                {num(estoque)} {estoque < p.estoqueMinimo && <Badge color="red">abaixo do mín.</Badge>}
              </Td>
              <Td>
                <Link href={`/cadastros/produtos/${p.id}`} className={btn.small}>Editar</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
