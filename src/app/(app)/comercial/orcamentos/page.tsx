import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { date, money, toNumber } from "@/lib/format";
import { Filtros, FiltroSelect } from "../_components/filtros";
import { nomeHospital, opcoesHospitais } from "../_lib/opcoes";

const STATUS = ["RASCUNHO", "ENVIADO", "APROVADO", "RECUSADO"] as const;

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ status?: string; hospital?: string }> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const [orcs, hospitais] = await Promise.all([
    db.orcamento.findMany({
      where: {
        ...(sp.status && (STATUS as readonly string[]).includes(sp.status) ? { status: sp.status as (typeof STATUS)[number] } : {}),
        ...(sp.hospital ? { hospitalId: sp.hospital } : {}),
      },
      include: { hospital: true, convenio: true, itens: true },
      orderBy: { id: "desc" },
      take: 200,
    }),
    opcoesHospitais(false),
  ]);
  return (
    <>
      <PageHeader title="Orçamentos" subtitle="Propostas de materiais para hospitais e convênios" actions={<LinkButton href="/comercial/orcamentos/novo">Novo orçamento</LinkButton>} />
      <Filtros limparHref="/comercial/orcamentos">
        <FiltroSelect label="Status" name="status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} defaultValue={sp.status} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={sp.hospital} />
      </Filtros>
      <Table head={["Nº", "Data", "Hospital", "Convênio", "Paciente", "Validade", "Total", "Status", ""]} empty={orcs.length === 0}>
        {orcs.map((o) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <Td className="font-mono">ORC-{o.id}</Td>
            <Td>{date(o.criadoEm)}</Td>
            <Td>{nomeHospital(o.hospital)}</Td>
            <Td>{o.convenio?.nome ?? "—"}</Td>
            <Td>{o.paciente ?? "—"}</Td>
            <Td>{date(o.validade)}</Td>
            <Td className="font-semibold">{money(o.itens.reduce((s, i) => s + i.quantidade * toNumber(i.precoUnit), 0))}</Td>
            <Td><StatusBadge status={o.status} /></Td>
            <Td><Link href={`/comercial/orcamentos/${o.id}`} className="text-teal-700 hover:underline">Abrir</Link></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
