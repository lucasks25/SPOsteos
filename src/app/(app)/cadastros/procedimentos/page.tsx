import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERFIS_COMERCIAL } from "../_lib/acoes";
import { podeEditarCadastro } from "../_lib/somente-leitura";
import { LinkButton, PageHeader, SearchBar, Table, Td, btn, KpiGrid, Stat } from "@/components/ui";
import { num } from "@/lib/format";
import { soStrings } from "@/lib/search-params";

export default async function ProcedimentosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const edita = podeEditarCadastro(user.perfil, PERFIS_COMERCIAL);
  const { q } = soStrings(await searchParams);
  const procs = await db.procedimento.findMany({
    where: q
      ? { OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigoTuss: { contains: q } }, { especialidade: { contains: q, mode: "insensitive" } }] }
      : undefined,
    include: { _count: { select: { itens: true, cirurgias: true } } },
    orderBy: { descricao: "asc" },
  });
  return (
    <>
      <PageHeader title="Procedimentos" subtitle="Procedimentos cirúrgicos com os materiais padrão de cada um." actions={edita ? <LinkButton href="/cadastros/procedimentos/novo">Novo procedimento</LinkButton> : undefined} />
      <KpiGrid cols={3}>
        <Stat label="Listados" value={procs.length} />
        <Stat label="Sem materiais padrão" value={procs.filter((p) => p._count.itens === 0).length} hint="perfil ainda vazio" />
        <Stat label="Cirurgias" value={num(procs.reduce((s, p) => s + p._count.cirurgias, 0))} hint="dos procedimentos listados" />
      </KpiGrid>
      <SearchBar placeholder="Descrição, TUSS ou especialidade" defaultValue={q} />
      <Table titulo="Procedimentos" contagem={procs.length} head={["Procedimento", "Especialidade", "Materiais", "Cirurgias", ""]} empty={procs.length === 0} emptyText={q ? "Nenhum procedimento encontrado para essa busca." : "Nenhum procedimento encontrado."} emptyAction={edita ? <LinkButton href="/cadastros/procedimentos/novo" variant="secondary" icon="mais">Cadastrar procedimento</LinkButton> : undefined}>
        {procs.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/cadastros/procedimentos/${p.id}`} className="font-medium text-teal-700 hover:underline">{p.descricao}</Link>
              <div className="text-xs text-slate-500">TUSS <span className="font-mono">{p.codigoTuss ?? "—"}</span></div>
            </Td>
            <Td>{p.especialidade ?? "—"}</Td>
            <Td className="text-right">{num(p._count.itens)}</Td>
            <Td className="text-right">{num(p._count.cirurgias)}</Td>
            <Td>
              <Link href={`/cadastros/procedimentos/${p.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
