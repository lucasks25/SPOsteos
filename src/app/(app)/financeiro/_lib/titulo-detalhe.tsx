import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/form";
import { Badge, Card, Dl, EmptyState, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { FORMAS_PAGAMENTO, TIPOS, type Tipo } from "./config";
import { linhaDigitavel } from "./boleto";
import { cancelarTitulo, estornarBaixaAction, estornarGlosaAction, recursoGlosaAction } from "./actions";
import { ROTULO_CATEGORIA_GLOSA } from "./glosa-categorias";
import { hojeUTC } from "@/lib/datas";
import { opcoesContas } from "./contas";
import { listarParceiros, obterTitulo } from "./queries";
import { opcoesClassificacao } from "./plano";
import { BaixaForm, ClassificarForm, GlosaForm, TituloForm } from "./titulo-form";
import { SituacaoTitulo } from "./titulos-view";

const formaLabel = (f: string | null) => FORMAS_PAGAMENTO.find((x) => x.value === f)?.label ?? "—";

/** Detalhe de um título (receber ou pagar): dados, baixas, nova baixa, edição e cancelamento. */
export async function TituloDetalhe({ tipo, id }: { tipo: Tipo; id: string }) {
  const cfg = TIPOS[tipo];
  const hoje = hojeUTC();
  const titulo = await obterTitulo(tipo, id);
  if (!titulo) notFound();
  const [baixas, contas, parceiros, { planos, centros }, glosas] = await Promise.all([
    db.lancamento.findMany({
      where: tipo === "receber" ? { contaReceberId: id } : { contaPagarId: id },
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      include: { conta: { select: { nome: true } }, extrato: { select: { id: true } } },
    }),
    opcoesContas(),
    listarParceiros(tipo, titulo.parceiroId),
    opcoesClassificacao(db, [titulo.planoContaId, titulo.centroCustoId]),
    tipo === "receber" ? db.glosa.findMany({ where: { contaReceberId: id }, orderBy: { data: "asc" } }) : Promise.resolve([]),
  ]);
  const semBaixas = baixas.length === 0;
  const editavel = titulo.status === "ABERTO" && semBaixas && glosas.every((g) => g.recurso === "REVERTIDA");

  return (
    <>
      <PageHeader
        voltar={{ href: `/financeiro/${tipo}`, label: tipo === "receber" ? "Contas a receber" : "Contas a pagar" }}
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
      <KpiGrid>
        <Stat icon="banco" label="Valor" value={money(titulo.valor)} />
        <Stat
          label={cfg.pagoLabel}
          value={money(titulo.valorPago ?? 0)}
          hint={
            (titulo.valorPago ?? 0) > 0 && titulo.pagoEm
              ? `dinheiro movimentado; última baixa em ${date(titulo.pagoEm)}`
              : glosas.some((g) => g.recurso !== "REVERTIDA")
                ? `nenhum dinheiro ainda; glosa de ${money(glosas.filter((g) => g.recurso !== "REVERTIDA").reduce((a, g) => a + toNumber(g.valor), 0))} em ${date(glosas.filter((g) => g.recurso !== "REVERTIDA").at(-1)!.data)}`
                : undefined
          }
        />
        <Stat icon="banco" label="Saldo" value={money(titulo.saldo)} tone={titulo.saldo > 0 && titulo.vencimento < hoje ? "danger" : "default"} />
        <Stat icon="calendario" label="Vencimento" value={date(titulo.vencimento)} />
      </KpiGrid>

      <div className="space-y-4">
        <Card title="Dados do título" icon="documento">
          <Dl
            items={[
              [cfg.parceiro, titulo.parceiroNome],
              ["Conta do plano", titulo.categoria ?? "Não classificado"],
              ["Centro de custo", titulo.centroNome],
              ["Competência", date(titulo.competencia)],
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
              ...(tipo === "pagar" && titulo.codigoBarras
                ? ([
                    [
                      "Boleto (linha digitável)",
                      <span key="b" className="break-all font-mono text-xs">
                        {linhaDigitavel(titulo.codigoBarras)}
                        <span className="block text-xs text-slate-500">código de barras {titulo.codigoBarras} · valor no boleto {Number(titulo.codigoBarras.slice(9, 19)) ? money(Number(titulo.codigoBarras.slice(9, 19)) / 100) : "não informado"}</span>
                      </span>,
                    ],
                  ] as [string, ReactNode][])
                : []),
            ]}
          />
        </Card>

        {tipo === "receber" && titulo.cobrancaStatus && (
          <Card title="Cobrança bancária" icon="documento">
            <Dl
              items={[
                ["Status", <Badge key="s" color={titulo.cobrancaStatus === "REGISTRADO" ? "green" : "blue"}>{titulo.cobrancaStatus.toLowerCase()}</Badge>],
                ["Nosso número", titulo.nossoNumero ?? "—"],
              ]}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {titulo.cobrancaStatus === "REGISTRADO" && titulo.status === "ABERTO" ? (
                <Link href={`/financeiro/receber/${titulo.id}/boleto`} className={btn.secondary}>
                  Imprimir boleto
                </Link>
              ) : (
                <>
                  <button type="button" disabled className={btn.secondary}>
                    Imprimir boleto
                  </button>
                  <span className="text-xs text-slate-600">
                    {titulo.cobrancaStatus === "ENVIADO"
                      ? "Disponível quando o banco confirmar o registro: importe o arquivo de retorno em Cobrança."
                      : "Só é possível imprimir com o título em aberto e o registro confirmado pelo banco."}
                  </span>
                </>
              )}
            </div>
          </Card>
        )}

          <Table titulo="Baixas" icone="ok" contagem={baixas.length} head={["Data", "Dinheiro", "Principal", "Juros", "Multa", "Desconto", "Conta", "Forma", "Conciliação", ""]} empty={semBaixas} emptyText="Nenhuma baixa registrada neste título.">
            {baixas.map((b) => (
              <tr key={b.id}>
                <Td>{date(b.data)}</Td>
                <Td className="text-right tnum">{money(toNumber(b.valor))}</Td>
                <Td className="text-right tnum">{money(toNumber(b.principal))}</Td>
                <Td className="text-right tnum">{toNumber(b.juros) ? money(toNumber(b.juros)) : "—"}</Td>
                <Td className="text-right tnum">{toNumber(b.multa) ? money(toNumber(b.multa)) : "—"}</Td>
                <Td className="text-right tnum">{toNumber(b.desconto) ? money(toNumber(b.desconto)) : "—"}</Td>
                <Td>{b.conta.nome}</Td>
                <Td>{formaLabel(b.forma)}</Td>
                <Td>{b.extrato ? <Badge color="green">conciliada</Badge> : <Badge>pendente</Badge>}</Td>
                <Td>
                  {!b.extrato && (
                    <ActionButton action={estornarBaixaAction.bind(null, tipo)} hidden={{ id: b.id }} variant="small" confirm={`Estornar a baixa de ${money(toNumber(b.valor))} de ${date(b.data)}?`}>
                      Estornar
                    </ActionButton>
                  )}
                </Td>
              </tr>
            ))}
          </Table>

        {glosas.length > 0 && (
          <Table titulo="Glosas" icone="alerta" contagem={glosas.length} head={["Data", "Categoria", "Valor", "Motivo", "Recurso", ""]}>
            {glosas.map((g) => (
              <tr key={g.id}>
                <Td>{date(g.data)}</Td>
                <Td>{ROTULO_CATEGORIA_GLOSA[g.categoria]}</Td>
                <Td className="text-right tnum">{money(toNumber(g.valor))}</Td>
                <Td className="max-w-md whitespace-normal">{g.motivo}</Td>
                <Td>
                  {g.recurso === "NENHUM" ? <span className="text-slate-500">—</span> : <StatusBadge status={g.recurso} />}
                  {g.recursoEm && g.recurso !== "NENHUM" && <div className="text-xs text-slate-500">{date(g.recursoEm)}</div>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {g.recurso === "NENHUM" && (
                      <ActionButton action={recursoGlosaAction} hidden={{ id: g.id, acao: "RECORRER" }} variant="small" confirm="Registrar que esta glosa está em recurso junto ao convênio/hospital?">
                        Registrar recurso
                      </ActionButton>
                    )}
                    {g.recurso === "EM_RECURSO" && (
                      <>
                        <ActionButton action={recursoGlosaAction} hidden={{ id: g.id, acao: "REVERTER" }} variant="small" confirm={`Marcar como revertida? O hospital aceitou pagar: a glosa de ${money(toNumber(g.valor))} deixa de abater o título, que volta a ter esse saldo em aberto.`}>
                          Marcar revertida
                        </ActionButton>
                        <ActionButton action={recursoGlosaAction} hidden={{ id: g.id, acao: "MANTER" }} variant="small" confirm="Marcar como mantida? O recurso foi negado; o saldo do título não muda.">
                          Marcar mantida
                        </ActionButton>
                      </>
                    )}
                    {g.recurso !== "REVERTIDA" && (
                      <ActionButton action={estornarGlosaAction} hidden={{ id: g.id }} variant="small" confirm={`Estornar a glosa de ${money(toNumber(g.valor))} de ${date(g.data)}? (use só para corrigir um lançamento errado; se o hospital aceitou pagar, use Marcar revertida)`}>
                        Estornar
                      </ActionButton>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}

        {tipo === "receber" && titulo.status === "ABERTO" && (
          <Card title="Registrar glosa" icon="alerta">
            <p className="mb-3 text-sm text-slate-600">Use quando o hospital não reconhece parte da cobrança. Abate o saldo sem movimentar dinheiro e aparece em Deduções no DRE (não é desconto).</p>
            <GlosaForm titulo={titulo} hoje={hoje} />
          </Card>
        )}

        {titulo.status === "ABERTO" && (
          <Card title={cfg.baixaLabel} icon="ok">
            {contas.length === 0 ? (
              <EmptyState text="Nenhuma conta bancária ou caixa cadastrada. Cadastre uma antes de registrar baixas." action={<LinkButton href="/financeiro/contas/nova" variant="secondary">Cadastrar conta</LinkButton>} />
            ) : (
              <BaixaForm tipo={tipo} titulo={titulo} hoje={hoje} contas={contas} />
            )}
          </Card>
        )}

        {titulo.status !== "CANCELADO" && !editavel && (
          <Card title="Classificação (DRE)" icon="etiqueta">
            <ClassificarForm tipo={tipo} titulo={titulo} planos={planos} centros={centros} />
          </Card>
        )}

        {editavel && (
          <Card title="Editar título" icon="ajustes">
            <TituloForm tipo={tipo} titulo={titulo} parceiros={parceiros} planos={planos} centros={centros} hoje={hoje} />
          </Card>
        )}
      </div>
    </>
  );
}
