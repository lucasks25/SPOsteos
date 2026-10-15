import Link from "next/link";
import { Field, Form, Grid, Select } from "@/components/form";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { hojeUTC, ymd } from "../_lib/datas";
import { FORMAS_SISPAG } from "../_lib/sispag";
import { gerarRemessaPagamentos, processarRetornoSispag } from "../_lib/sispag-actions";
import { formaPrevista, type ModoRemessa } from "../_lib/sispag-regras";

type SP = Record<string, string | string[] | undefined>;

export default async function RemessasPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const modo: ModoRemessa = sp.modo === "PIX" ? "PIX" : "TED_BOLETO";
  const hoje = hojeUTC();
  const [contas, titulos, remessas] = await Promise.all([
    db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.contaPagar.findMany({
      where: { status: "ABERTO", pagamentos: { none: { status: { in: ["ENVIADO", "AGENDADO"] } } } },
      orderBy: { vencimento: "asc" },
      take: 300,
      include: { fornecedor: true },
    }),
    db.remessaPagamento.findMany({
      orderBy: { id: "desc" },
      take: 50,
      include: { conta: { select: { nome: true } }, itens: { select: { status: true, valor: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Pagamentos SISPAG (Itaú)" subtitle="Gere o arquivo de remessa, envie no Itaú Empresas e importe o retorno para baixar as contas pagas." />

      <div className="space-y-6">
        <Card title="Nova remessa">
          <div className="mb-3 flex gap-2 text-sm">
            <Link href="/financeiro/remessas" className={modo === "TED_BOLETO" ? "font-semibold text-teal-800 underline" : "text-teal-700 hover:underline"}>
              TED, crédito em conta e boletos
            </Link>
            <span className="text-slate-300">|</span>
            <Link href="/financeiro/remessas?modo=PIX" className={modo === "PIX" ? "font-semibold text-teal-800 underline" : "text-teal-700 hover:underline"}>
              Pix (arquivo separado, exigência do Itaú)
            </Link>
          </div>
          {contas.length === 0 ? (
            <p className="text-sm text-slate-600">
              Cadastre a conta do Itaú em{" "}
              <Link href="/financeiro/contas/nova" className="text-teal-700 hover:underline">
                Contas bancárias
              </Link>
              .
            </p>
          ) : (
            <Form action={gerarRemessaPagamentos} submitLabel="Gerar arquivo de remessa">
              <input type="hidden" name="modo" value={modo} />
              <Grid cols={3}>
                <Select label="Conta a debitar *" name="contaId" options={contas.map((c) => ({ value: c.id, label: c.nome }))} defaultValue={contas.length === 1 ? contas[0].id : ""} required />
                <Field label="Data do pagamento *" name="dataPagto" type="date" defaultValue={ymd(hoje)} min={ymd(hoje)} required />
              </Grid>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left">Vencimento</th>
                      <th className="px-3 py-2 text-left">Descrição</th>
                      <th className="px-3 py-2 text-left">Fornecedor</th>
                      <th className="px-3 py-2 text-right">A pagar</th>
                      <th className="px-3 py-2 text-left">Forma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {titulos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                          Nenhuma conta a pagar em aberto fora de remessa.
                        </td>
                      </tr>
                    )}
                    {titulos.map((t) => {
                      const f = t.aprovadoEm ? formaPrevista(t, t.fornecedor, modo) : { erro: "aguardando aprovação do financeiro" };
                      const saldo = toNumber(t.valor) - toNumber(t.valorBaixado);
                      const ok = "forma" in f;
                      return (
                        <tr key={t.id} className={ok ? "" : "bg-slate-50 text-slate-400"}>
                          <td className="px-3 py-2">
                            <input type="checkbox" name="tituloId" value={t.id} disabled={!ok} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                          </td>
                          <td className={`px-3 py-2 ${t.vencimento < hoje && ok ? "text-rose-700" : ""}`}>{date(t.vencimento)}</td>
                          <td className="max-w-xs truncate px-3 py-2">
                            <Link href={`/financeiro/pagar/${t.id}`} className="hover:underline">
                              {t.descricao}
                            </Link>
                          </td>
                          <td className="max-w-[14rem] truncate px-3 py-2">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(saldo)}</td>
                          <td className="px-3 py-2">{ok ? FORMAS_SISPAG[f.forma] : <span className="text-amber-700">{f.erro}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                Contas sem dados bancários ficam bloqueadas: complete o fornecedor (banco, agência, conta ou chave Pix) ou cadastre o boleto na conta a pagar.
              </p>
            </Form>
          )}
        </Card>

        <Card title="Importar retorno do Itaú">
          <Form action={processarRetornoSispag} submitLabel="Processar retorno" resetOnSuccess>
            <Field label="Arquivo de retorno SISPAG" name="arquivo" type="file" accept=".ret,.RET,.txt,.TXT" required hint="Pagamentos com ocorrência 00 são baixados automaticamente na conta da remessa. Reprocessar o mesmo arquivo não duplica baixas." />
          </Form>
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Remessas geradas</h2>
          <Table head={["Remessa", "Conta", "Modo", "Pagamento", "Itens", "Total", "Situação"]} empty={remessas.length === 0}>
            {remessas.map((r) => {
              const total = r.itens.reduce((s, i) => s + toNumber(i.valor), 0);
              const conta = (s: string) => r.itens.filter((i) => i.status === s).length;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/financeiro/remessas/${r.id}`} className="text-teal-700 hover:underline">
                      #{r.id}
                    </Link>
                  </Td>
                  <Td>{r.conta.nome}</Td>
                  <Td>{r.modo === "PIX" ? "Pix" : "TED / boleto"}</Td>
                  <Td>{date(r.dataPagto)}</Td>
                  <Td>{r.itens.length}</Td>
                  <Td className="text-right tabular-nums">{money(total)}</Td>
                  <Td className="space-x-1">
                    {r.canceladaEm && <Badge color="gray">cancelada</Badge>}
                    {conta("PAGO") > 0 && <Badge color="green">{conta("PAGO")} pago(s)</Badge>}
                    {conta("AGENDADO") > 0 && <Badge color="blue">{conta("AGENDADO")} agendado(s)</Badge>}
                    {conta("REJEITADO") > 0 && <Badge color="red">{conta("REJEITADO")} rejeitado(s)</Badge>}
                    {conta("ENVIADO") > 0 && <Badge>{conta("ENVIADO")} aguardando retorno</Badge>}
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
