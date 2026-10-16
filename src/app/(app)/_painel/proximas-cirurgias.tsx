import Link from "next/link";
import { Card, StatusBadge, Table, Td, btn } from "@/components/ui";
import { Celula } from "@/components/lista";
import { dateTime } from "@/lib/format";
import type { proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";

/** "Próximas cirurgias" do painel: só leitura, cada linha leva à cirurgia no comercial. */
export function ProximasCirurgias({ cirurgias }: { cirurgias: Awaited<ReturnType<typeof proximasCirurgias>> }) {
  const verAgenda = <Link href="/comercial/agenda" className={btn.small}>Ver agenda</Link>;
  if (cirurgias.length === 0) {
    return (
      <Card title="Próximas cirurgias" actions={verAgenda}>
        <p className="text-sm text-slate-600">Nenhuma cirurgia agendada a partir de hoje.</p>
      </Card>
    );
  }
  return (
    <Table
      titulo="Próximas cirurgias"
      contagem={cirurgias.length}
      acoes={verAgenda}
      head={["Data", "Cirurgia", { label: "Hospital", hideOnMobile: true }, { label: "Procedimento", hideOnMobile: true }, "Situação"]}
    >
      {cirurgias.map((c) => (
        <tr key={c.id}>
          <Td className="tnum">{dateTime(c.dataHora).replace(/\/\d{4},/, "")}</Td>
          <Td><Celula href={`/comercial/cirurgias/${c.id}`} principal={`CIR-${c.numero}`} sub={<>{c.medico}{!c.temVale && <span className="text-amber-600"> · sem vale</span>}</>} /></Td>
          <Td className="max-w-36 truncate" title={c.hospital}>{c.hospital}</Td>
          <Td className="max-w-32 truncate" title={c.procedimento ?? undefined}>{c.procedimento ?? "—"}</Td>
          <Td>
            <StatusBadge status={c.status} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}
