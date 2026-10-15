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
      <PageHeader title="Orçamentos" subtitle="Propostas de materiais para hospitais e convênios." actions={<LinkButton href="/comercial/orcamentos/novo" icon="mais">Novo orçamento</LinkButton>} />
      <Filtros limparHref="/comercial/orcamentos">
        <FiltroSelect label="Status" name="status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} defaultValue={sp.status} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={sp.hospital} />
      </Filtros>
      <Table head={["Nº", "Data", "Hospital", "Convênio", "Paciente", "Validade", "Total", "Status", "Ações"]} empty={orcs.length === 0} emptyText="Nenhum orçamento encontrado para os filtros informados." emptyAction={<LinkButton href="/comercial/orcamentos/novo" variant="secondary">Criar orçamento</LinkButton>}>
        {orcs.map((o) => (
          <tr key={o.id}>
            <Td className="font-mono text-xs">ORC-{o.id}</Td>
            <Td>{date(o.criadoEm)}</Td>
            <Td>{nomeHospital(o.hospital)}</Td>
            <Td>{o.convenio?.nome ?? "—"}</Td>
            <Td>{o.paciente ?? "—"}</Td>
            <Td>{date(o.validade)}</Td>
            <Td className="text-right font-semibold">{money(o.itens.reduce((s, i) => s + i.quantidade * toNumber(i.precoUnit), 0))}</Td>
            <Td><StatusBadge status={o.status} /></Td>
            <Td><LinkButton href={`/comercial/orcamentos/${o.id}`} variant="small">Abrir</LinkButton></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
