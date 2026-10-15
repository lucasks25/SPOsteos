import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, Table, Td } from "@/components/ui";
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
      <Table head={["Código", "Descrição", "Itens", "Unidades", "Remessas", "Ações"]} empty={kits.length === 0} emptyText="Nenhum kit cadastrado." emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/kits/novo" variant="secondary">Novo kit</LinkButton> : undefined}>
        {kits.map((k) => (
          <tr key={k.id}>
            <Td className="font-mono text-xs">{k.codigo}</Td>
            <Td className="font-medium">{k.descricao}</Td>
            <Td className="text-right">{num(k.itens.length)}</Td>
            <Td className="text-right">{num(k.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td className="text-right">{num(k._count.remessas)}</Td>
            <Td>
              <LinkButton href={`/estoque/kits/${k.id}`} variant="small">Abrir</LinkButton>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
