import Link from "next/link";
import { ActionButton, Field, Form } from "@/components/form";
import { Badge, Card, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, num } from "@/lib/format";
import { carregarConciliacao } from "../_lib/conciliacao";
import { desfazerConciliacao, importarExtrato } from "../_lib/conciliacao-actions";
import { LinhaPendente } from "./linha";

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const contas = await db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  const escolhida = typeof sp.conta === "string" ? contas.find((c) => c.id === sp.conta) : contas[0];

  if (!escolhida) {
    return (
      <>
        <PageHeader title="Conciliação bancária" />
        <Card>
          <p className="text-sm text-slate-600">
            Cadastre uma conta bancária em{" "}
            <Link href="/financeiro/contas/nova" className="text-teal-700 hover:underline">
              Contas bancárias
            </Link>{" "}
            para importar o extrato e conciliar.
          </p>
        </Card>
      </>
    );
  }

  const d = await carregarConciliacao(escolhida.id);
  return (
    <>
      <PageHeader title="Conciliação bancária" subtitle="Importe o extrato do banco (OFX ou CNAB 240) e case cada linha com uma baixa, um título ou um lançamento avulso." />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Conta</span>
          <select name="conta" defaultValue={escolhida.id} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <button className={btn.secondary}>Trocar</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Linhas pendentes" value={num(d.pendTotal)} tone={d.pendTotal > 0 ? "warn" : "default"} />
        <Stat label="Conciliadas" value={num(d.concTotal)} />
        <Stat label="Lançamentos sem extrato" value={num(d.semExtrato)} hint="baixas ainda não vistas no banco" />
      </div>

      <div className="space-y-6">
        <Card title="Importar extrato (OFX ou CNAB 240 Itaú)">
          <Form action={importarExtrato} submitLabel="Importar" resetOnSuccess>
            <input type="hidden" name="contaId" value={escolhida.id} />
            <Field label="Arquivo do extrato" name="arquivo" type="file" accept=".ofx,.OFX,.ret,.RET,.txt,.TXT,.cnab,.CNAB" required hint="OFX do internet banking ou arquivo de retorno CNAB 240 de extrato do Itaú. Lançamentos já importados são ignorados." />
          </Form>
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Pendentes de conciliação{d.pendTotal > 100 && " (exibindo as 100 mais antigas)"}</h2>
          {d.pendentes.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Nada pendente nesta conta.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {d.pendentes.map((p) => (
                <LinhaPendente key={p.linha.id} linha={p.linha} sugLanc={p.sugLanc} exatos={p.exatos} titulos={p.titulos} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Últimas conciliadas</h2>
          <Table head={["Data", "Extrato", "Valor", "Vinculada a", ""]} empty={d.conciliadas.length === 0}>
            {d.conciliadas.map((l) => (
              <tr key={l.id}>
                <Td>{date(l.data)}</Td>
                <Td className="max-w-xs truncate">{l.descricao}</Td>
                <Td className={`tabular-nums ${l.valor > 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(l.valor)}</Td>
                <Td className="max-w-xs truncate">
                  <Badge color="green">conciliada</Badge> {l.vinculo}
                </Td>
                <Td>
                  <ActionButton action={desfazerConciliacao.bind(null, l.id)} confirm="Desfazer esta conciliação?">
                    Desfazer
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </>
  );
}
