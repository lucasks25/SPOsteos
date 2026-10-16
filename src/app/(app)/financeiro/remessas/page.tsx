import Link from "next/link";
import { Field, Form, Grid, Select } from "@/components/form";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { Celula } from "@/components/lista";
import { hojeUTC, ymd } from "@/lib/datas";
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

      <div className="space-y-3">
        {contas.length === 0 ? (
          <Card title="Nova remessa" icon="pagar">
            <EmptyState text="Nenhuma conta bancária cadastrada. Cadastre a conta do Itaú para gerar remessas." action={<LinkButton href="/financeiro/contas/nova" variant="secondary">Cadastrar conta bancária</LinkButton>} />
          </Card>
        ) : (
          <Form action={gerarRemessaPagamentos} submitLabel="Gerar arquivo de remessa" className="space-y-3">
            <input type="hidden" name="modo" value={modo} />
            <Card title="Nova remessa" icon="pagar">
              <div className="mb-3 flex gap-2 text-xs">
                <Link href="/financeiro/remessas" className={modo === "TED_BOLETO" ? "rounded border border-teal-700 bg-teal-50 px-2 py-1 font-semibold text-teal-800" : "rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"}>
                  TED, crédito em conta e boletos
                </Link>
                <Link href="/financeiro/remessas?modo=PIX" className={modo === "PIX" ? "rounded border border-teal-700 bg-teal-50 px-2 py-1 font-semibold text-teal-800" : "rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"}>
                  Pix (arquivo separado, exigência do Itaú)
                </Link>
              </div>
              <Grid cols={3}>
                <Select label="Conta a debitar *" name="contaId" options={contas.map((c) => ({ value: c.id, label: c.nome }))} defaultValue={contas.length === 1 ? contas[0].id : ""} required />
                <Field label="Data do pagamento *" name="dataPagto" type="date" defaultValue={ymd(hoje)} min={ymd(hoje)} required />
              </Grid>
            </Card>
            <Table
              titulo="Contas a pagar disponíveis para a remessa"
              icone="lista"
              contagem={titulos.length}
              head={[<span key="s" className="sr-only">Selecionar</span>, "Vencimento", "Descrição", "A pagar", "Forma"]}
              empty={titulos.length === 0}
              emptyText="Nenhuma conta a pagar em aberto fora de remessa."
            >
              {titulos.map((t) => {
                const f = t.aprovadoEm ? formaPrevista(t, t.fornecedor, modo) : { erro: "aguardando aprovação do financeiro" };
                const saldo = toNumber(t.valor) - toNumber(t.valorBaixado);
                const ok = "forma" in f;
                return (
                  <tr key={t.id} className={ok ? "" : "bg-slate-50 text-slate-500"}>
                    <Td>
                      <input type="checkbox" name="tituloId" value={t.id} disabled={!ok} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                    </Td>
                    <Td className={t.vencimento < hoje && ok ? "font-medium text-rose-600" : ""}>{date(t.vencimento)}</Td>
                    <Td className="max-w-xs">
                      <Celula href={`/financeiro/pagar/${t.id}`} principal={t.descricao} sub={t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "Sem fornecedor"} />
                    </Td>
                    <Td className="text-right tnum font-medium">{money(saldo)}</Td>
                    <Td>{ok ? FORMAS_SISPAG[f.forma] : <span className="text-amber-700">{f.erro}</span>}</Td>
                  </tr>
                );
              })}
            </Table>
            <p className="text-xs text-slate-500">
              Contas sem dados bancários ficam bloqueadas: complete o fornecedor (banco, agência, conta ou chave Pix) ou cadastre o boleto na conta a pagar.
            </p>
          </Form>
        )}

        <Table
          titulo="Remessas geradas"
          icone="documento"
          contagem={remessas.length}
          head={["Remessa", "Pagamento", "Itens", "Total", "Situação"]}
          empty={remessas.length === 0}
          emptyText="Nenhuma remessa de pagamento gerada ainda. Gere a primeira acima."
        >
          {remessas.map((r) => {
            const total = r.itens.reduce((s, i) => s + toNumber(i.valor), 0);
            const conta = (s: string) => r.itens.filter((i) => i.status === s).length;
            return (
              <tr key={r.id}>
                <Td>
                  <Celula href={`/financeiro/remessas/${r.id}`} principal={`#${r.id}`} sub={`${r.conta.nome} · ${r.modo === "PIX" ? "Pix" : "TED / boleto"}`} />
                </Td>
                <Td>{date(r.dataPagto)}</Td>
                <Td className="text-right tnum">{r.itens.length}</Td>
                <Td className="text-right tnum font-medium">{money(total)}</Td>
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

        <Card title="Importar retorno do Itaú" icon="baixar">
          <Form action={processarRetornoSispag} submitLabel="Processar retorno" resetOnSuccess>
            <Field label="Arquivo de retorno SISPAG" name="arquivo" type="file" accept=".ret,.RET,.txt,.TXT" required hint="Pagamentos com ocorrência 00 são baixados automaticamente na conta da remessa. Reprocessar o mesmo arquivo não duplica baixas." />
          </Form>
        </Card>
      </div>
    </>
  );
}
