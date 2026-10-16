import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_PRODUTO } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { Badge, LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { date, diasAte, money, num } from "@/lib/format";
import { soStrings } from "@/lib/search-params";

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_PRODUTO);
  const { q } = soStrings(await searchParams);
  const produtos = await db.produto.findMany({
    where: q
      ? { OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }, { registroAnvisa: { contains: q } }, { gtin: { contains: q } }] }
      : undefined,
    include: { fabricante: true, saldos: { select: { quantidade: true } } },
    orderBy: { descricao: "asc" },
    take: 200,
  });
  const abaixoMin = produtos.filter((p) => p.saldos.reduce((s, x) => s + x.quantidade, 0) < p.estoqueMinimo).length;
  const regVencendo = produtos.filter((p) => p.validadeRegistro && diasAte(p.validadeRegistro) <= 90).length;
  return (
    <>
      <PageHeader title="Produtos" subtitle="Materiais, implantes e instrumentais com registro ANVISA." actions={edita ? <LinkButton href="/cadastros/produtos/novo">Novo produto</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat label="Listados" value={produtos.length} />
        <Stat label="Abaixo do mínimo" value={abaixoMin} hint="produtos com estoque abaixo do mínimo" />
        <Stat label="Registro a vencer" value={regVencendo} hint="vencido ou vencendo em 90 dias" />
      </KpiGrid>
      <SearchBar placeholder="Código, descrição, registro ANVISA ou GTIN" defaultValue={q} />
      <Table titulo="Produtos" contagem={produtos.length} head={["Produto", "Registro ANVISA", "Venc. registro", "Preço base", "Estoque", ""]} empty={produtos.length === 0} emptyText={q ? "Nenhum produto encontrado para essa busca." : "Nenhum produto encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/produtos/novo" variant="secondary" icon="mais">Cadastrar produto</LinkButton> : undefined}>
        {produtos.map((p) => {
          const estoque = p.saldos.reduce((s, x) => s + x.quantidade, 0);
          const dias = p.validadeRegistro ? diasAte(p.validadeRegistro) : null;
          return (
            <tr key={p.id}>
              <Td>
                <Link href={`/cadastros/produtos/${p.id}`} className="font-medium text-teal-700 hover:underline">{p.descricao}</Link> {!p.ativo && <Badge>inativo</Badge>}
                <div className="text-xs text-slate-500"><span className="font-mono">{p.codigo}</span> · {p.fabricante?.nome ?? "sem fabricante"}</div>
              </Td>
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
