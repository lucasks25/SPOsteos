import type { Prisma, StatusRemessa } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "../../comercial/_components/filtros";
import { date, dateTime, num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../_lib/perfis";

const STATUS: StatusRemessa[] = ["ABERTA", "ENVIADA", "CONFERIDA", "CANCELADA"];

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
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/remessas/nova" icon="mais">Nova remessa</LinkButton>}
      />
      <Filtros limparHref="/estoque/remessas">
        <FiltroInput label="Busca" name="q" defaultValue={sp.q} placeholder="Nº da remessa ou paciente" className="w-60" />
        <FiltroSelect label="Status" name="status" defaultValue={status} todos="Todos os status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="Hospital" name="hospitalId" defaultValue={sp.hospitalId} todos="Todos os hospitais" options={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))} />
      </Filtros>
      <Table head={["Nº", "Hospital", "Cirurgia", "Kit", "Itens", "Status", "Criada", "Enviada", "Ações"]} empty={remessas.length === 0} emptyText="Nenhuma remessa encontrada para os filtros informados." emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/remessas/nova" variant="secondary">Nova remessa</LinkButton> : undefined}>
        {remessas.map((r) => (
          <tr key={r.id}>
            <Td className="font-mono text-xs">REM-{r.id}</Td>
            <Td>{r.local.hospital?.nomeFantasia ?? r.local.hospital?.razaoSocial ?? r.local.nome}</Td>
            <Td>
              {r.cirurgia ? (
                <span>
                  nº {r.cirurgia.numero} — {r.cirurgia.paciente}
                  <span className="block text-xs text-slate-600">{dateTime(r.cirurgia.dataHora)}</span>
                </span>
              ) : (
                "—"
              )}
            </Td>
            <Td>{r.kit?.codigo ?? "—"}</Td>
            <Td className="text-right">{num(r.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td><StatusBadge status={r.status} /></Td>
            <Td>{date(r.criadoEm)}</Td>
            <Td>{r.enviadaEm ? dateTime(r.enviadaEm) : "—"}</Td>
            <Td>
              <LinkButton href={`/estoque/remessas/${r.id}`} variant="small">Abrir</LinkButton>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
