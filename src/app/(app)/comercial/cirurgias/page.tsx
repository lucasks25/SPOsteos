import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { Prisma, StatusCirurgia } from "@/generated/prisma/client";
import { Filtros, FiltroInput, FiltroSelect } from "../_components/filtros";
import { nomeHospital, opcoesHospitais, opcoesMedicos } from "../_lib/opcoes";
import { periodo } from "../_lib/datas";

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

  return (
    <>
      <PageHeader
        title="Cirurgias"
        subtitle="Agendamento, consumo e faturamento de procedimentos"
        actions={
          <>
            <LinkButton href="/comercial/agenda" variant="secondary">Agenda semanal</LinkButton>
            <LinkButton href="/comercial/cirurgias/nova">Nova cirurgia</LinkButton>
          </>
        }
      />
      <Filtros limparHref="/comercial/cirurgias">
        <FiltroInput label="Paciente" name="q" defaultValue={sp.q} placeholder="Nome do paciente" />
        <FiltroSelect label="Status" name="status" defaultValue={status} options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="Hospital" name="hospital" defaultValue={sp.hospital} options={hospitais} />
        <FiltroSelect label="Médico" name="medico" defaultValue={sp.medico} options={medicos} />
        <FiltroInput label="De" name="de" type="date" defaultValue={sp.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={sp.ate} />
      </Filtros>
      <Table head={["Nº", "Data/hora", "Paciente", "Hospital", "Médico", "Procedimento", "Convênio", "Status", ""]} empty={cirurgias.length === 0}>
        {cirurgias.map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <Td className="font-mono text-xs">CIR-{c.numero}</Td>
            <Td>{dateTime(c.dataHora)}</Td>
            <Td>
              {c.paciente} {c.sus && <Badge color="blue">SUS</Badge>}
            </Td>
            <Td>{nomeHospital(c.hospital)}</Td>
            <Td>{c.medico.nome}</Td>
            <Td className="max-w-56 truncate">{c.procedimento?.descricao ?? "—"}</Td>
            <Td>{c.convenio?.nome ?? (c.sus ? "SUS" : "—")}</Td>
            <Td>
              <StatusBadge status={c.status} />
              {c._count.remessas > 0 && <span className="ml-1 text-xs text-slate-400">{c._count.remessas} rem.</span>}
            </Td>
            <Td>
              <Link href={`/comercial/cirurgias/${c.id}`} className="text-teal-700 hover:underline">Abrir</Link>
            </Td>
          </tr>
        ))}
      </Table>
      {cirurgias.length === 300 && <p className="mt-2 text-xs text-slate-400">Exibindo as 300 mais recentes. Refine os filtros.</p>}
    </>
  );
}
