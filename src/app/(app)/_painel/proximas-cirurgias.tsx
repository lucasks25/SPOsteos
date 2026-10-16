import Link from "next/link";
import { StatusBadge, Table, Td, btn } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";

/** Tabela "Próximas cirurgias" do painel: só leitura, cada linha leva à cirurgia no comercial. */
export function ProximasCirurgias({ cirurgias }: { cirurgias: Awaited<ReturnType<typeof proximasCirurgias>> }) {
  return (
    <Table
      titulo="Próximas cirurgias"
      icone="calendario"
      contagem={cirurgias.length}
      acoes={<Link href="/comercial/agenda" className={btn.small}>Ver agenda</Link>}
      head={["Data", "Cirurgia", "Hospital", "Procedimento", "Vale", "Situação"]}
      empty={cirurgias.length === 0}
      emptyText="Nenhuma cirurgia agendada a partir de hoje."
    >
      {cirurgias.map((c) => (
        <tr key={c.id}>
          <Td className="tnum">{dateTime(c.dataHora)}</Td>
          <Td>
            <Link href={`/comercial/cirurgias/${c.id}`} className="font-semibold text-teal-700 hover:underline">CIR-{c.numero}</Link>
            <div className="text-xs text-slate-500">{c.medico}</div>
          </Td>
          <Td>{c.hospital}</Td>
          <Td className="max-w-48 truncate">{c.procedimento ?? "—"}</Td>
          <Td>{c.temVale ? "sim" : <span className="text-amber-600">pendente</span>}</Td>
          <Td><StatusBadge status={c.status} /></Td>
        </tr>
      ))}
    </Table>
  );
}
