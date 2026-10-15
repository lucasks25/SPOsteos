import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KpiGrid, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../_lib/perfis";

export default async function KitsPage() {
  const user = await requireUser(PERFIS_VER);
  const kits = await db.kit.findMany({ include: { itens: true, _count: { select: { remessas: true } } }, orderBy: { codigo: "asc" } });
  return (
    <>
      <PageHeader
        title="Caixas e kits"
        subtitle="Conjuntos padrão de implantes e instrumentais enviados aos hospitais."
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/kits/novo" icon="mais">Novo kit</LinkButton>}
      />
      <KpiGrid cols={3}>
        <Stat label="Kits cadastrados" value={num(kits.length)} />
        <Stat label="Itens distintos" value={num(kits.reduce((n, k) => n + k.itens.length, 0))} hint={`${num(kits.reduce((n, k) => n + k.itens.reduce((x, i) => x + i.quantidade, 0), 0))} unidade(s) no total`} />
        <Stat label="Remessas geradas" value={num(kits.reduce((n, k) => n + k._count.remessas, 0))} />
      </KpiGrid>
      <Table titulo="Caixas e kits" icone="pacote" contagem={kits.length} head={["Kit", "Itens", "Unidades", "Remessas", "Ações"]} empty={kits.length === 0} emptyText="Nenhum kit cadastrado." emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/kits/novo" variant="secondary">Novo kit</LinkButton> : undefined}>
        {kits.map((k) => (
          <tr key={k.id}>
            <Td>
              <Link href={`/estoque/kits/${k.id}`} className="font-medium text-teal-700 hover:underline">{k.descricao}</Link>
              <div className="font-mono text-[11px] text-slate-500">{k.codigo}</div>
            </Td>
            <Td className="tnum text-right">{num(k.itens.length)}</Td>
            <Td className="tnum text-right">{num(k.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td className="tnum text-right">{num(k._count.remessas)}</Td>
            <Td>
              <LinkButton href={`/estoque/kits/${k.id}`} variant="small">Abrir</LinkButton>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
