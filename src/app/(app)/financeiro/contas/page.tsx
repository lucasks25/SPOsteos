import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { transferirEntreContas } from "../_lib/contas-actions";
import { hojeUTC, ymd } from "../_lib/datas";
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

      {contas.filter((c) => c.ativo).length >= 2 && (
        <div className="mt-6">
          <Card title="Transferência entre contas">
            <p className="mb-3 text-sm text-slate-500">Move dinheiro entre contas suas. Muda o saldo de cada conta, mas não conta como receita nem despesa no painel e no fluxo de caixa.</p>
            <Form action={transferirEntreContas} submitLabel="Transferir" resetOnSuccess>
              <Grid cols={4}>
                <Select label="De *" name="origemId" options={contas.filter((c) => c.ativo).map((c) => ({ value: c.id, label: `${c.nome} (${money(c.saldo)})` }))} required />
                <Select label="Para *" name="destinoId" options={contas.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))} required />
                <Field label="Valor (R$) *" name="valor" type="number" step="0.01" min="0.01" required />
                <Field label="Data *" name="data" type="date" defaultValue={ymd(hojeUTC())} max={ymd(hojeUTC())} required />
                <Field label="Descrição" name="descricao" maxLength={120} placeholder="Transferência entre contas" className="sm:col-span-2" />
              </Grid>
            </Form>
          </Card>
        </div>
      )}
    </>
  );
}
