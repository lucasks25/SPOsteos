import Link from "next/link";
import { Field, Form, Grid, Select } from "@/components/form";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { gerarCobranca, processarRetornoCobranca } from "../_lib/cobranca-actions";
import { faltaNoPagador } from "../_lib/cobranca-servico";
import { hojeUTC } from "../_lib/datas";

export default async function CobrancaPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const [contas, abertos, registrados, remessas] = await Promise.all([
    db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO", carteiraCobranca: "109" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.contaReceber.findMany({
      where: { status: "ABERTO", OR: [{ cobrancaStatus: null }, { cobrancaStatus: "REJEITADO" }] },
      orderBy: { vencimento: "asc" },
      take: 300,
      include: { hospital: true },
    }),
    db.contaReceber.findMany({ where: { cobrancaStatus: "REGISTRADO", status: { not: "ABERTO" } }, take: 100, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.remessaCobranca.findMany({ orderBy: { id: "desc" }, take: 30, include: { conta: { select: { nome: true } }, itens: { select: { status: true } } } }),
  ]);

  return (
    <>
      <PageHeader title="Cobrança dos hospitais (boleto Itaú)" subtitle="Gere a remessa CNAB 400 de boletos registrados, envie no Itaú Empresas e importe o retorno: os boletos pagos são baixados automaticamente." />
      <div className="space-y-6">
        {contas.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              Nenhuma conta com cobrança habilitada. Em <Link href="/financeiro/contas" className="text-teal-700 hover:underline">Contas bancárias</Link>, abra a conta do Itaú e selecione a carteira de cobrança 109 (exige convênio de cobrança contratado no banco).
            </p>
          </Card>
        ) : (
          <Card title="Nova remessa de cobrança">
            <Form action={gerarCobranca} submitLabel="Gerar arquivo de remessa">
              <Grid cols={3}>
                <Select label="Conta de cobrança *" name="contaId" options={contas.map((c) => ({ value: c.id, label: c.nome }))} defaultValue={contas.length === 1 ? contas[0].id : ""} required />
              </Grid>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-[13px]">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Selecionar</span></th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Vencimento</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Título</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Hospital</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Saldo</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 [&>tr:hover]:bg-slate-50/70">
                    {abertos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                          Nenhum título a receber sem cobrança.
                        </td>
                      </tr>
                    )}
                    {abertos.map((t) => {
                      const falta = t.hospital ? faltaNoPagador(t.hospital) : ["hospital"];
                      const motivo = t.vencimento < hoje ? "vencimento já passou" : falta.length ? `falta ${falta.join(", ")} no hospital` : null;
                      return (
                        <tr key={t.id} className={motivo ? "bg-slate-50 text-slate-400" : ""}>
                          <td className="px-3 py-2">
                            <input type="checkbox" name="tituloId" value={t.id} disabled={!!motivo} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                          </td>
                          <td className="px-3 py-2">{date(t.vencimento)}</td>
                          <td className="max-w-xs truncate px-3 py-2">
                            <Link href={`/financeiro/receber/${t.id}`} className="hover:underline">
                              {t.descricao}
                            </Link>
                          </td>
                          <td className="max-w-[14rem] truncate px-3 py-2">{t.hospital ? t.hospital.nomeFantasia || t.hospital.razaoSocial : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(toNumber(t.valor) - toNumber(t.valorBaixado))}</td>
                          <td className="px-3 py-2 text-xs">{motivo ? <span className="text-amber-700">{motivo}</span> : t.cobrancaStatus === "REJEITADO" ? <Badge color="red">rejeitado: gerar de novo</Badge> : "pronto"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {registrados.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-sm font-medium text-amber-900">Boletos registrados cujo título foi pago ou cancelado por outro meio: peça baixa para o hospital não pagar de novo.</p>
                  {registrados.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 py-0.5 text-sm text-amber-900">
                      <input type="checkbox" name="baixaId" value={t.id} className="h-4 w-4" />
                      {t.descricao} — {t.hospital ? t.hospital.nomeFantasia || t.hospital.razaoSocial : "—"} ({t.status.toLowerCase()})
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500">Os dados de endereço do hospital saem do cadastro. Multa e juros por atraso seguem o configurado na conta. Só imprima o boleto depois que o banco confirmar o registro (retorno).</p>
            </Form>
          </Card>
        )}

        <Card title="Importar retorno de cobrança do Itaú">
          <Form action={processarRetornoCobranca} submitLabel="Processar retorno" resetOnSuccess>
            <Field label="Arquivo de retorno (CNAB 400)" name="arquivo" type="file" accept=".ret,.RET,.txt,.TXT" required hint="Confirmações de registro, liquidações (baixa automática do recebimento), rejeições e baixas. Reprocessar o mesmo arquivo não duplica nada." />
          </Form>
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Remessas de cobrança</h2>
          <Table head={["Remessa", "Conta", "Gerada em", "Itens", "Situação"]} empty={remessas.length === 0}>
            {remessas.map((r) => {
              const n = (s: string) => r.itens.filter((i) => i.status === s).length;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/financeiro/cobranca/${r.id}`} className="text-teal-700 hover:underline">
                      #{r.id}
                    </Link>
                  </Td>
                  <Td>{r.conta.nome}</Td>
                  <Td>{date(r.criadaEm)}</Td>
                  <Td>{r.itens.length}</Td>
                  <Td className="space-x-1">
                    {r.canceladaEm && <Badge color="gray">cancelada</Badge>}
                    {n("LIQUIDADO") > 0 && <Badge color="green">{n("LIQUIDADO")} pago(s)</Badge>}
                    {n("CONFIRMADO") > 0 && <Badge color="blue">{n("CONFIRMADO")} registrado(s)</Badge>}
                    {n("REJEITADO") > 0 && <Badge color="red">{n("REJEITADO")} rejeitado(s)</Badge>}
                    {n("ENVIADO") > 0 && <Badge>{n("ENVIADO")} aguardando retorno</Badge>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </section>
      </div>
    </>
  );
}
