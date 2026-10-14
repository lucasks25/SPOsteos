import Link from "next/link";
import { Badge, LinkButton, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { listarContas } from "../_lib/contas";

export default async function ContasPage() {
  await requireUser(["FINANCEIRO"]);
  const contas = await listarContas();
  const total = contas.filter((c) => c.ativo).reduce((s, c) => s + c.saldo, 0);
  return (
    <>
      <PageHeader
        title="Contas bancárias e caixa"
        subtitle="Onde o dinheiro entra e sai. O saldo vem dos lançamentos (baixas e avulsos)."
        actions={<LinkButton href="/financeiro/contas/nova">Nova conta</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Disponibilidade total" value={money(total)} hint={`${contas.filter((c) => c.ativo).length} conta(s) ativa(s)`} tone={total < 0 ? "danger" : "default"} />
      </div>
      <Table head={["Conta", "Tipo", "Banco / agência / número", "Saldo", "", ""]} empty={contas.length === 0}>
        {contas.map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/financeiro/contas/${c.id}`} className="text-teal-700 hover:underline">
                {c.nome}
              </Link>
            </Td>
            <Td>{c.tipo === "CAIXA" ? "Caixa" : "Banco"}</Td>
            <Td>{[c.banco, c.agencia, c.numero].filter(Boolean).join(" / ") || "—"}</Td>
            <Td className="text-right tabular-nums">{money(c.saldo)}</Td>
            <Td>{!c.ativo && <Badge>inativa</Badge>}</Td>
            <Td>
              <Link href={`/financeiro/contas/${c.id}`} className={btn.small}>
                Movimentos
              </Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
