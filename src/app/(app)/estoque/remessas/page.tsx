import Link from "next/link";
import type { Prisma, StatusRemessa } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, StatusBadge, Table, Td, btn } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../_lib/perfis";

const STATUS: StatusRemessa[] = ["ABERTA", "ENVIADA", "CONFERIDA", "CANCELADA"];
const selCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export default async function RemessasPage({ searchParams }: { searchParams: Promise<{ status?: string; hospitalId?: string; q?: string }> }) {
  const user = await requireUser(PERFIS_VER);
  const sp = await searchParams;
  const status = STATUS.includes(sp.status as StatusRemessa) ? (sp.status as StatusRemessa) : undefined;
  const numero = sp.q ? Number(sp.q.replace(/\D/g, "")) : NaN;

  const where: Prisma.RemessaWhereInput = {
    ...(status ? { status } : {}),
    ...(sp.hospitalId ? { local: { hospitalId: sp.hospitalId } } : {}),
    ...(sp.q
      ? {
          OR: [
            ...(Number.isInteger(numero) && numero > 0 ? [{ id: numero }] : []),
            { cirurgia: { paciente: { contains: sp.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [remessas, hospitais] = await Promise.all([
    db.remessa.findMany({
      where,
      include: {
        local: { include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } },
        cirurgia: { select: { numero: true, paciente: true, dataHora: true } },
        kit: { select: { codigo: true } },
        itens: { select: { quantidade: true } },
      },
      orderBy: { id: "desc" },
      take: 200,
    }),
    db.hospital.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Remessas / vales de consignação"
        subtitle="Materiais enviados aos hospitais para cirurgias"
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/remessas/nova">Nova remessa</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Nº da remessa ou paciente" className={`${selCls} w-full max-w-xs`} />
        <select name="status" defaultValue={status ?? ""} className={selCls}>
          <option value="">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>{s.toLowerCase()}</option>
          ))}
        </select>
        <select name="hospitalId" defaultValue={sp.hospitalId ?? ""} className={selCls}>
          <option value="">Todos os hospitais</option>
          {hospitais.map((h) => (
            <option key={h.id} value={h.id}>{h.nomeFantasia ?? h.razaoSocial}</option>
          ))}
        </select>
        <button className={btn.secondary}>Filtrar</button>
      </form>
      <Table head={["Nº", "Hospital", "Cirurgia", "Kit", "Itens", "Status", "Criada", "Enviada", ""]} empty={remessas.length === 0}>
        {remessas.map((r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <Td className="font-mono text-xs">REM-{r.id}</Td>
            <Td>{r.local.hospital?.nomeFantasia ?? r.local.hospital?.razaoSocial ?? r.local.nome}</Td>
            <Td>
              {r.cirurgia ? (
                <span>
                  nº {r.cirurgia.numero} — {r.cirurgia.paciente}
                  <span className="block text-xs text-slate-400">{dateTime(r.cirurgia.dataHora)}</span>
                </span>
              ) : (
                "—"
              )}
            </Td>
            <Td>{r.kit?.codigo ?? "—"}</Td>
            <Td>{num(r.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td><StatusBadge status={r.status} /></Td>
            <Td>{date(r.criadoEm)}</Td>
            <Td>{r.enviadaEm ? dateTime(r.enviadaEm) : "—"}</Td>
            <Td>
              <Link href={`/estoque/remessas/${r.id}`} className="text-teal-700 hover:underline">Abrir</Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
