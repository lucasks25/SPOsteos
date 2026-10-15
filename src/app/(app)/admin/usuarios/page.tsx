import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, btn, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { date } from "@/lib/format";

export default async function UsuariosPage() {
  await requireUser([]);
  const usuarios = await db.usuario.findMany({ select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true }, orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
  return (
    <>
      <PageHeader title="Usuários" subtitle="Gerencie as contas de acesso ao sistema e seus perfis." actions={<LinkButton href="/admin/usuarios/novo">Novo usuário</LinkButton>} />
      <Table head={["Nome", "E-mail", "Perfil", "Situação", "Criado em", ""]} empty={usuarios.length === 0} emptyText="Nenhum usuário cadastrado." emptyAction={<LinkButton href="/admin/usuarios/novo" variant="secondary" icon="mais">Criar usuário</LinkButton>}>
        {usuarios.map((u) => (
          <tr key={u.id}>
            <Td className="font-medium">{u.nome}</Td>
            <Td>{u.email}</Td>
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
