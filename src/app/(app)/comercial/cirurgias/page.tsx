import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { Badge, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { dateTime, num } from "@/lib/format";
import type { Prisma, StatusCirurgia } from "@/generated/prisma/client";
import { Filtros, FiltroInput, FiltroSelect } from "../_components/filtros";
import { nomeHospital, opcoesHospitais, opcoesMedicos } from "../_lib/opcoes";
import { periodo } from "@/lib/datas";

const STATUS: StatusCirurgia[] = ["AGENDADA", "CONFIRMADA", "REALIZADA", "FATURADA", "CANCELADA"];

type SP = { q?: string; status?: string; hospital?: string; medico?: string; de?: string; ate?: string };

export default async function CirurgiasPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const status = STATUS.includes(sp.status as StatusCirurgia) ? (sp.status as StatusCirurgia) : undefined;
  const p = periodo(sp.de, sp.ate);
  const where: Prisma.CirurgiaWhereInput = {
    status,
    hospitalId: sp.hospital || undefined,
    medicoId: sp.medico || undefined,
    dataHora: p.gte || p.lt ? p : undefined,
    paciente: sp.q ? { contains: sp.q, mode: "insensitive" } : undefined,
  };
  const [cirurgias, hospitais, medicos] = await Promise.all([
    db.cirurgia.findMany({
      where,
      include: {
        hospital: { select: { nomeFantasia: true, razaoSocial: true } },
        medico: { select: { nome: true } },
        procedimento: { select: { descricao: true } },
        convenio: { select: { nome: true } },
        _count: { select: { remessas: true, consumos: true } },
      },
      orderBy: { dataHora: "desc" },
      take: 300,
    }),
    opcoesHospitais(false),
    opcoesMedicos(false),
  ]);

  const n = (st: StatusCirurgia) => cirurgias.filter((c) => c.status === st).length;
  return (
    <>
      <PageHeader
        title="Cirurgias"
        subtitle="Acompanhe o agendamento, o consumo de material e o faturamento de cada procedimento."
        actions={
          <>
            <LinkButton href="/comercial/agenda" variant="secondary" icon="calendario">Agenda semanal</LinkButton>
            <LinkButton href="/comercial/cirurgias/nova" icon="mais">Nova cirurgia</LinkButton>
          </>
        }
      />
      <KpiGrid>
        <Stat label="Na lista" value={num(cirurgias.length)} hint={cirurgias.length === 300 ? "limite de 300 atingido" : "cirurgia(s)"} />
        <Stat label="Agendadas / confirmadas" value={num(n("AGENDADA") + n("CONFIRMADA"))} hint={<span className="text-sky-700">{n("CONFIRMADA")} confirmada(s)</span>} />
        <Stat label="Realizadas, a faturar" value={num(n("REALIZADA"))} hint={<span className={n("REALIZADA") ? "text-amber-700" : undefined}>aguardam faturamento</span>} tone={n("REALIZADA") ? "warn" : "default"} />
        <Stat label="Faturadas" value={num(n("FATURADA"))} hint={<span className="text-emerald-700">com pedido de venda</span>} />
      </KpiGrid>
      <Filtros limparHref="/comercial/cirurgias">
        <FiltroInput label="Paciente" name="q" defaultValue={sp.q} placeholder="Nome do paciente" />
        <FiltroSelect label="Status" name="status" defaultValue={status} options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="Hospital" name="hospital" defaultValue={sp.hospital} options={hospitais} />
        <FiltroSelect label="Médico" name="medico" defaultValue={sp.medico} options={medicos} />
        <FiltroInput label="De" name="de" type="date" defaultValue={sp.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={sp.ate} />
      </Filtros>
      <Table
        titulo="Cirurgias"
        icone="atividade"
        contagem={cirurgias.length}
        head={["Cirurgia", "Paciente", "Hospital", "Convênio", "Situação", "Ações"]}
        empty={cirurgias.length === 0}
        emptyText="Nenhuma cirurgia encontrada para os filtros informados."
        emptyAction={<LinkButton href="/comercial/cirurgias/nova" variant="secondary">Agendar cirurgia</LinkButton>}
      >
        {cirurgias.map((c) => (
          <tr key={c.id}>
            <Td>
              <Link href={`/comercial/cirurgias/${c.id}`} className="font-mono text-xs font-semibold text-teal-700 hover:underline">CIR-{c.numero}</Link>
              <div className="text-[11px] text-slate-500">{dateTime(c.dataHora)}</div>
            </Td>
            <Td className="max-w-[16rem]">
              <div className="truncate font-medium text-teal-700">{c.paciente} {c.sus && <Badge color="blue">SUS</Badge>}</div>
              <div className="truncate text-xs text-slate-500">{c.procedimento?.descricao ?? "Procedimento não informado"}</div>
            </Td>
            <Td className="max-w-[16rem]">
              <div className="truncate">{nomeHospital(c.hospital)}</div>
              <div className="truncate text-xs text-slate-500">{c.medico.nome}</div>
            </Td>
            <Td>{c.convenio?.nome ?? (c.sus ? "SUS" : "—")}</Td>
            <Td>
              <StatusBadge status={c.status} />
              {c._count.remessas > 0 && <span className="ml-1 text-xs text-slate-500">{c._count.remessas} vale(s)</span>}
            </Td>
            <Td>
              <LinkButton href={`/comercial/cirurgias/${c.id}`} variant="small">Abrir</LinkButton>
            </Td>
          </tr>
        ))}
      </Table>
      {cirurgias.length === 300 && <p className="mt-2 text-xs text-slate-600">Exibindo as 300 mais recentes. Refine os filtros.</p>}
    </>
  );
}
