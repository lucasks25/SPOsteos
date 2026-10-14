import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/form";
import { Badge, Card, Dl, PageHeader, Stat, Table, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { FORMAS_PAGAMENTO, TIPOS, type Tipo } from "./config";
import { cancelarTitulo, estornarBaixaAction } from "./actions";
import { hojeUTC } from "./datas";
import { opcoesContas } from "./contas";
import { listarParceiros, obterTitulo } from "./queries";
import { BaixaForm, TituloForm } from "./titulo-form";
import { SituacaoTitulo } from "./titulos-view";

const formaLabel = (f: string | null) => FORMAS_PAGAMENTO.find((x) => x.value === f)?.label ?? "—";

/** Detalhe de um título (receber ou pagar): dados, baixas, nova baixa, edição e cancelamento. */
export async function TituloDetalhe({ tipo, id }: { tipo: Tipo; id: string }) {
  const cfg = TIPOS[tipo];
  const hoje = hojeUTC();
  const titulo = await obterTitulo(tipo, id);
  if (!titulo) notFound();
  const [baixas, contas, parceiros] = await Promise.all([
    db.lancamento.findMany({
      where: tipo === "receber" ? { contaReceberId: id } : { contaPagarId: id },
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      include: { conta: { select: { nome: true } }, extrato: { select: { id: true } } },
    }),
    opcoesContas(),
    listarParceiros(tipo, titulo.parceiroId),
  ]);
  const semBaixas = baixas.length === 0;
  const editavel = titulo.status === "ABERTO" && semBaixas;

  return (
    <>
      <PageHeader
        title={titulo.descricao}
        subtitle={cfg.singular}
        actions={
          <>
            <SituacaoTitulo t={titulo} hoje={hoje} />
            {editavel && (
              <ActionButton action={cancelarTitulo.bind(null, tipo)} hidden={{ id }} variant="danger" confirm="Cancelar este título?">
                Cancelar título
              </ActionButton>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Valor" value={money(titulo.valor)} />
        <Stat label={cfg.pagoLabel} value={money(titulo.valorPago ?? 0)} hint={titulo.pagoEm ? `última baixa em ${date(titulo.pagoEm)}` : undefined} />
        <Stat label="Saldo" value={money(titulo.saldo)} tone={titulo.saldo > 0 && titulo.vencimento < hoje ? "danger" : "default"} />
        <Stat label="Vencimento" value={date(titulo.vencimento)} />
      </div>

      <div className="space-y-6">
        <Card title="Dados">
          <Dl
            items={[
              [cfg.parceiro, titulo.parceiroNome],
              ...(tipo === "pagar" ? ([["Categoria", titulo.categoria]] as [string, string | null][]) : []),
              [
                "Origem",
                titulo.pedidoId ? (
                  <Link key="o" href={cfg.pedidoHref(titulo.pedidoId)} className="text-teal-700 hover:underline">
                    {cfg.pedidoLabel(titulo.pedidoId)}
                  </Link>
                ) : (
                  "Lançamento manual"
                ),
              ],
              ["Criado em", date(titulo.criadoEm)],
            ]}
          />
        </Card>

        <Card title={`Baixas (${baixas.length})`}>
          <Table head={["Data", "Valor", "Conta", "Forma", "Conciliação", ""]} empty={semBaixas}>
            {baixas.map((b) => (
              <tr key={b.id}>
                <Td>{date(b.data)}</Td>
                <Td className="tabular-nums">{money(toNumber(b.valor))}</Td>
                <Td>{b.conta.nome}</Td>
                <Td>{formaLabel(b.forma)}</Td>
                <Td>{b.extrato ? <Badge color="green">conciliada</Badge> : <Badge>pendente</Badge>}</Td>
                <Td>
                  {!b.extrato && (
                    <ActionButton action={estornarBaixaAction.bind(null, tipo)} hidden={{ id: b.id }} variant="secondary" confirm="Estornar esta baixa?">
                      Estornar
                    </ActionButton>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        {titulo.status === "ABERTO" && (
          <Card title={cfg.baixaLabel}>
            {contas.length === 0 ? (
              <p className="text-sm text-slate-600">
                Cadastre uma conta bancária ou caixa em{" "}
                <Link href="/financeiro/contas" className="text-teal-700 hover:underline">
                  Contas bancárias
                </Link>{" "}
                antes de registrar baixas.
              </p>
            ) : (
              <BaixaForm tipo={tipo} titulo={titulo} hoje={hoje} contas={contas} />
            )}
          </Card>
        )}

        {editavel && (
          <Card title="Editar título">
            <TituloForm tipo={tipo} titulo={titulo} parceiros={parceiros} />
          </Card>
        )}
      </div>
    </>
  );
}
