import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Table, Td, btn } from "@/components/ui";
import { dateTime } from "@/lib/format";

const POR_PAGINA = 50;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ entidade?: string; usuario?: string; page?: string }>;
}) {
  await requireUser([]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.entidade ? { entidade: sp.entidade } : {}),
    ...(sp.usuario ? { usuarioId: sp.usuario } : {}),
  };
  const [logs, total, entidades, usuarios] = await Promise.all([
    db.logAuditoria.findMany({ where, include: { usuario: { select: { nome: true } } }, orderBy: { criadoEm: "desc" }, skip: (page - 1) * POR_PAGINA, take: POR_PAGINA }),
    db.logAuditoria.count({ where }),
    db.logAuditoria.findMany({ distinct: ["entidade"], select: { entidade: true }, orderBy: { entidade: "asc" } }),
    db.usuario.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (sp.entidade) q.set("entidade", sp.entidade);
    if (sp.usuario) q.set("usuario", sp.usuario);
    q.set("page", String(p));
    return `/admin/auditoria?${q}`;
  };
  const sel = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <>
      <PageHeader title="Log de auditoria" subtitle={`${total} registro(s)`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="entidade" defaultValue={sp.entidade ?? ""} className={sel}>
          <option value="">Todas as entidades</option>
          {entidades.map((e) => (
            <option key={e.entidade} value={e.entidade}>{e.entidade}</option>
          ))}
        </select>
        <select name="usuario" defaultValue={sp.usuario ?? ""} className={sel}>
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <Table head={["Data/hora", "Usuário", "Ação", "Entidade", "ID", "Detalhes"]} empty={logs.length === 0}>
        {logs.map((l) => (
          <tr key={l.id}>
            <Td className="text-xs">{dateTime(l.criadoEm)}</Td>
            <Td>{l.usuario?.nome ?? "sistema"}</Td>
            <Td className="font-medium">{l.acao}</Td>
            <Td>{l.entidade}</Td>
            <Td className="max-w-40 truncate font-mono text-xs">{l.entidadeId ?? "—"}</Td>
            <Td className="max-w-md truncate whitespace-normal text-xs text-slate-500">{l.detalhes ?? ""}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>Página {page} de {paginas}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={link(page - 1)} className={btn.secondary}>Anterior</Link>}
          {page < paginas && <Link href={link(page + 1)} className={btn.secondary}>Próxima</Link>}
        </div>
      </div>
    </>
  );
}
