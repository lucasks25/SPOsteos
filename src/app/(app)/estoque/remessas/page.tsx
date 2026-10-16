import Link from "next/link";
import type { Prisma, StatusRemessa } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
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

  const qtd = (st: string) => remessas.filter((r) => r.status === st).length;
  const unid = (l: typeof remessas) => l.reduce((n, r) => n + r.itens.reduce((x, i) => x + i.quantidade, 0), 0);

  return (
    <>
      <PageHeader
        title="Remessas / vales de consignação"
        subtitle="Materiais enviados aos hospitais para cirurgias"
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/remessas/nova" icon="mais">Nova remessa</LinkButton>}
      />
      <KpiGrid>
        <Stat label="Na lista" value={num(remessas.length)} hint={`${num(unid(remessas))} unidade(s)`} />
        <Stat label="Abertas (a enviar)" value={num(qtd("ABERTA"))} hint={<span className={qtd("ABERTA") ? "text-amber-700" : undefined}>separadas, sem envio</span>} tone={qtd("ABERTA") ? "warn" : "default"} />
        <Stat label="Enviadas (a conferir)" value={num(qtd("ENVIADA"))} hint={<span className="text-sky-700">{num(unid(remessas.filter((r) => r.status === "ENVIADA")))} un. nos hospitais</span>} />
        <Stat label="Conferidas" value={num(qtd("CONFERIDA"))} hint={<span className="text-emerald-700">retorno concluído</span>} />
      </KpiGrid>
      <Filtros limparHref="/estoque/remessas">
        <FiltroInput label="Busca" name="q" defaultValue={sp.q} placeholder="Nº da remessa ou paciente" className="w-60" />
        <FiltroSelect label="Status" name="status" defaultValue={status} todos="Todos os status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="Hospital" name="hospitalId" defaultValue={sp.hospitalId} todos="Todos os hospitais" options={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))} />
      </Filtros>
      <Table
        titulo="Remessas / vales"
        icone="caminhao"
        contagem={remessas.length}
        head={["Remessa", "Hospital", "Cirurgia", "Kit", "Itens", "Situação", "Enviada", "Ações"]}
        empty={remessas.length === 0}
        emptyText="Nenhuma remessa encontrada para os filtros informados."
        emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/remessas/nova" variant="secondary">Nova remessa</LinkButton> : undefined}
      >
        {remessas.map((r) => (
          <tr key={r.id}>
            <Td>
              <Link href={`/estoque/remessas/${r.id}`} className="font-mono text-xs font-semibold text-teal-700 hover:underline">REM-{r.id}</Link>
              <div className="text-[11px] text-slate-500">{date(r.criadoEm)}</div>
            </Td>
            <Td className="max-w-[16rem] truncate font-medium">{r.local.hospital?.nomeFantasia ?? r.local.hospital?.razaoSocial ?? r.local.nome}</Td>
            <Td>
              {r.cirurgia ? (
                <>
                  <div className="font-medium text-teal-700">CIR-{r.cirurgia.numero} · {r.cirurgia.paciente}</div>
                  <div className="text-xs text-slate-500">{dateTime(r.cirurgia.dataHora)}</div>
                </>
              ) : (
                <span className="text-slate-500">sem cirurgia</span>
              )}
            </Td>
            <Td>{r.kit?.codigo ?? "—"}</Td>
            <Td className="tnum text-right">{num(r.itens.reduce((s, i) => s + i.quantidade, 0))}</Td>
            <Td><StatusBadge status={r.status} /></Td>
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
