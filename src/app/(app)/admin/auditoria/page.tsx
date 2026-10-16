import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FilterBar, PageHeader, Table, Td, btn } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { soStrings } from "@/lib/search-params";

const POR_PAGINA = 50;
/** "ContaPagar" -> "Conta Pagar": nome do cadastro legível no filtro e na coluna. */
/** Detalhe legível: hash (sha256) e IDs longos (cuid) viram prefixo com reticências; o texto completo fica no title. */
const legivel = (t: string) => t.replace(/\b[a-f0-9]{32,}\b/gi, (h) => `${h.slice(0, 8)}…`).replace(/\bc[a-z0-9]{24}\b/g, (id) => `${id.slice(0, 8)}…`);
const rotuloEntidade = (e: string) => e.replace(/([a-z])([A-Z])/g, "$1 $2");

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ entidade?: string; usuario?: string; page?: string }>;
}) {
  await requireUser([]);
  const sp = soStrings(await searchParams);
  const page = Math.min(1000, Math.max(1, Math.trunc(Number(sp.page)) || 1)); // teto: página gigante na URL não pode virar skip/take enorme
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
  const sel = "h-10 rounded-lg border border-field bg-white px-3 text-sm text-slate-900 hover:border-slate-500 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20";
  return (
    <>
      <PageHeader title="Log de auditoria" subtitle={`Quem fez o quê e quando no sistema, para conferência do administrador: ${total} registro(s).`} />
      <FilterBar>
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Entidade</span>
          <select name="entidade" defaultValue={sp.entidade ?? ""} className={sel}>
          <option value="">Todas as entidades</option>
          {entidades.map((e) => (
            <option key={e.entidade} value={e.entidade}>{rotuloEntidade(e.entidade)}</option>
          ))}
        </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Usuário</span>
          <select name="usuario" defaultValue={sp.usuario ?? ""} className={sel}>
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
        </label>
        <button className={btn.secondary}>Filtrar</button>
        <Link href="/admin/auditoria" className={btn.ghost}>Limpar</Link>
      </FilterBar>
      <Table titulo="Registros" contagem={total} head={["Data/hora", "Usuário", "Ação", "Entidade", "ID", "Detalhes"]} empty={logs.length === 0} emptyText="Nenhum registro de auditoria para esses filtros.">
        {logs.map((l) => (
          <tr key={l.id}>
            <Td className="tnum">{dateTime(l.criadoEm)}</Td>
            <Td>{l.usuario?.nome ?? "sistema"}</Td>
            <Td className="font-medium">{l.acao}</Td>
            <Td>{rotuloEntidade(l.entidade)}</Td>
            <Td className="max-w-32 truncate font-mono text-xs"><span title={l.entidadeId ?? undefined}>{l.entidadeId ?? "—"}</span></Td>
            <Td className="max-w-md truncate text-xs text-slate-600"><span title={l.detalhes ?? undefined}>{l.detalhes ? legivel(l.detalhes) : ""}</span></Td>
          </tr>
        ))}
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>Página {page} de {paginas}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={link(page - 1)} className={btn.secondary}>Anterior</Link>}
          {page < paginas && <Link href={link(page + 1)} className={btn.secondary}>Próxima</Link>}
        </div>
      </div>
    </>
  );
}
