import Link from "next/link";
import { Field, Form, Grid, Select } from "@/components/form";
import { Aviso, Badge, campo, Card, Dica, EmptyState, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, inputDate, money, toNumber } from "@/lib/format";
import { gerarCobranca, processarRetornoCobranca } from "../_lib/cobranca-actions";
import { faltaNoPagador } from "../_lib/cobranca-servico";
import { hojeUTC } from "@/lib/datas";

export default async function CobrancaPage() {
  await requireUser(["FINANCEIRO"]);
  const hoje = hojeUTC();
  const [contas, abertos, registrados, registradosAbertos, remessas] = await Promise.all([
    db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO", carteiraCobranca: "109" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.contaReceber.findMany({
      where: { status: "ABERTO", OR: [{ cobrancaStatus: null }, { cobrancaStatus: { in: ["REJEITADO", "BAIXADO", "LIQUIDADO"] } }] },
      orderBy: { vencimento: "asc" },
      take: 300,
      include: { hospital: true },
    }),
    db.contaReceber.findMany({ where: { cobrancaStatus: "REGISTRADO", status: { not: "ABERTO" } }, take: 100, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.contaReceber.findMany({ where: { cobrancaStatus: "REGISTRADO", status: "ABERTO" }, orderBy: { vencimento: "asc" }, take: 200, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.remessaCobranca.findMany({ orderBy: { id: "desc" }, take: 30, include: { conta: { select: { nome: true } }, itens: { select: { status: true } } } }),
  ]);

  const hosp = (h: { razaoSocial: string; nomeFantasia: string | null } | null) => (h ? h.nomeFantasia || h.razaoSocial : "—");

  return (
    <>
      <PageHeader title="Cobrança dos hospitais (boleto Itaú)" subtitle="Gere a remessa de boletos registrados, envie no Itaú Empresas e importe o retorno: os boletos pagos são baixados automaticamente." />
      <div className="space-y-4">
        {contas.length === 0 ? (
          <Card title="Nova remessa de cobrança">
            <EmptyState
              text="Nenhuma conta com cobrança habilitada. Abra a conta do Itaú e selecione a carteira de cobrança 109 (exige convênio de cobrança contratado no banco)."
              action={<LinkButton href="/financeiro/contas" variant="secondary">Ir para contas bancárias</LinkButton>}
            />
          </Card>
        ) : (
          <Form action={gerarCobranca} submitLabel="Gerar arquivo de remessa" className="space-y-4">
            <Card
              title="Nova remessa de cobrança"
              actions={<Dica alinhar="direita">Os dados de endereço do hospital saem do cadastro. Multa e juros por atraso seguem o configurado na conta. Só imprima o boleto depois que o banco confirmar o registro (retorno).</Dica>}
            >
              <Grid cols={3}>
                <Select label="Conta de cobrança *" name="contaId" options={contas.map((c) => ({ value: c.id, label: c.nome }))} defaultValue={contas.length === 1 ? contas[0].id : ""} required />
              </Grid>
            </Card>
            <Table
              titulo="Títulos a receber sem boleto"
              contagem={abertos.length}
              head={[<span key="s" className="sr-only">Selecionar</span>, "Vencimento", "Título", { label: "Hospital", hideOnMobile: true }, "Saldo", "Situação"]}
              empty={abertos.length === 0}
              emptyText="Nenhum título a receber sem cobrança."
            >
              {abertos.map((t) => {
                const falta = t.hospital ? faltaNoPagador(t.hospital) : ["hospital"];
                const motivo = t.vencimento < hoje ? "vencimento já passou" : falta.length ? `falta ${falta.join(", ")} no hospital` : null;
                return (
                  <tr key={t.id} className={motivo ? "text-slate-500" : ""}>
                    <Td>
                      <input type="checkbox" name="tituloId" value={t.id} disabled={!!motivo} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                    </Td>
                    <Td className="tnum">{date(t.vencimento)}</Td>
                    <Td className="max-w-xs truncate">
                      <Link href={`/financeiro/receber/${t.id}`} className="text-teal-700 hover:underline">
                        {t.descricao}
                      </Link>
                    </Td>
                    <Td className="max-w-[14rem] truncate">{hosp(t.hospital)}</Td>
                    <Td className="text-right tnum">{money(toNumber(t.valor) - toNumber(t.valorBaixado))}</Td>
                    <Td className="text-xs">{motivo ? <span className="text-amber-700">{motivo}</span> : t.cobrancaStatus === "REJEITADO" ? <Badge color="red">Rejeitado: gerar de novo</Badge> : <Badge color="green">Pronto</Badge>}</Td>
                  </tr>
                );
              })}
            </Table>
            {registrados.length > 0 && (
              <Aviso tom="alerta">
                <p className="mb-2 font-medium">Boletos registrados cujo título foi pago ou cancelado por outro meio: peça baixa para o hospital não pagar de novo.</p>
                {registrados.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" name="baixaId" value={t.id} className="h-4 w-4" />
                    {t.descricao} — {hosp(t.hospital)} ({t.status.toLowerCase()})
                  </label>
                ))}
              </Aviso>
            )}
            {registradosAbertos.length > 0 && (
              <Table
                titulo="Boletos registrados de títulos em aberto"
                contagem={registradosAbertos.length}
                acoes={<Dica alinhar="direita">Baixa (02): o banco cancela o boleto; depois de confirmada no retorno, o título fica livre para editar e gerar boleto novo. Alteração (06): o título passa a ter o novo vencimento quando o banco confirmar (retorno 14).</Dica>}
                head={["Título", { label: "Hospital", hideOnMobile: true }, "Vencimento", "Pedir baixa (02)", "Alterar vencimento (06)"]}
              >
                {registradosAbertos.map((t) => (
                  <tr key={t.id}>
                    <Td className="max-w-xs truncate">
                      <Link href={`/financeiro/receber/${t.id}`} className="text-teal-700 hover:underline">{t.descricao}</Link>
                    </Td>
                    <Td className="max-w-[14rem] truncate">{hosp(t.hospital)}</Td>
                    <Td className="tnum">{date(t.vencimento)}</Td>
                    <Td>
                      <input type="checkbox" name="baixaId" value={t.id} className="h-4 w-4" aria-label={`Pedir baixa do boleto de ${t.descricao}`} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <input type="checkbox" name="alterarId" value={t.id} className="mr-2 h-4 w-4 align-middle" aria-label={`Alterar vencimento de ${t.descricao}`} />
                      <input type="date" name={`vencimento_${t.id}`} min={inputDate(hoje)} className={`${campo} h-7 w-40`} aria-label={`Novo vencimento de ${t.descricao}`} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Form>
        )}

        <Table
          titulo="Remessas de cobrança"
          contagem={remessas.length}
          head={["Remessa", "Conta", "Gerada em", "Itens", "Situação"]}
          empty={remessas.length === 0}
          emptyText="Nenhuma remessa de cobrança gerada ainda."
        >
          {remessas.map((r) => {
            const n = (st: string) => r.itens.filter((i) => i.status === st).length;
            return (
              <tr key={r.id}>
                <Td>
                  <Link href={`/financeiro/cobranca/${r.id}`} className="link-linha font-medium text-teal-700 hover:underline">
                    #{r.id}
                  </Link>
                </Td>
                <Td>{r.conta.nome}</Td>
                <Td className="tnum">{date(r.criadaEm)}</Td>
                <Td className="text-right tnum">{r.itens.length}</Td>
                <Td className="space-x-1 whitespace-normal">
                  {r.canceladaEm && <Badge color="gray">Cancelada</Badge>}
                  {n("LIQUIDADO") > 0 && <Badge color="green">{n("LIQUIDADO")} pago(s)</Badge>}
                  {n("CONFIRMADO") > 0 && <Badge color="blue">{n("CONFIRMADO")} registrado(s)</Badge>}
                  {n("REJEITADO") > 0 && <Badge color="red">{n("REJEITADO")} rejeitado(s)</Badge>}
                  {n("ENVIADO") > 0 && <Badge>{n("ENVIADO")} aguardando retorno</Badge>}
                </Td>
              </tr>
            );
          })}
        </Table>

        <Card title="Importar retorno de cobrança do Itaú" actions={<Dica alinhar="direita">Confirmações de registro, liquidações (baixa automática do recebimento), rejeições e baixas. Reprocessar o mesmo arquivo não duplica nada.</Dica>}>
          <Form action={processarRetornoCobranca} submitLabel="Processar retorno" submitVariant="secondary" resetOnSuccess>
            <Field label="Arquivo de retorno (CNAB 400)" name="arquivo" type="file" accept=".ret,.RET,.txt,.TXT" required className="max-w-md" />
          </Form>
        </Card>
      </div>
    </>
  );
}
