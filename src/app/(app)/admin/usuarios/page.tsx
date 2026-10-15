import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, btn, KpiGrid, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { date } from "@/lib/format";

export default async function UsuariosPage() {
  await requireUser([]);
  const usuarios = await db.usuario.findMany({ select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true }, orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
  return (
    <>
      <PageHeader title="Usuários" subtitle="Gerencie as contas de acesso ao sistema e seus perfis." actions={<LinkButton href="/admin/usuarios/novo">Novo usuário</LinkButton>} />
      <KpiGrid cols={3}>
        <Stat label="Usuários" value={usuarios.length} />
        <Stat label="Ativos" value={usuarios.filter((u) => u.ativo).length} />
        <Stat label="Administradores" value={usuarios.filter((u) => u.perfil === "ADMIN").length} />
      </KpiGrid>
      <Table titulo="Contas de acesso" icone="usuarios" contagem={usuarios.length} head={["Usuário", "Perfil", "Situação", "Criado em", ""]} empty={usuarios.length === 0} emptyText="Nenhum usuário cadastrado." emptyAction={<LinkButton href="/admin/usuarios/novo" variant="secondary" icon="mais">Criar usuário</LinkButton>}>
        {usuarios.map((u) => (
          <tr key={u.id}>
            <Td>
              <Link href={`/admin/usuarios/${u.id}`} className="font-medium text-teal-700 hover:underline">{u.nome}</Link>
              <div className="text-xs text-slate-500">{u.email}</div>
            </Td>
            <Td>
              <Badge color={u.perfil === "ADMIN" ? "purple" : "teal"}>{u.perfil.toLowerCase()}</Badge>
            </Td>
            <Td>{u.ativo ? <Badge color="green">ativo</Badge> : <Badge>inativo</Badge>}</Td>
            <Td>{date(u.criadoEm)}</Td>
            <Td>
              <Link href={`/admin/usuarios/${u.id}`} className={btn.small}>Editar</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
