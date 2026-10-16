import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Aviso, Badge, Card, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, cx } from "@/components/ui";
import { ActionButton, Field, Form, Grid, Select, SubmitButton } from "@/components/form";
import { date, dateTime, money, num, toNumber } from "@/lib/format";
import { PERFIS_VER_INVENTARIO, podeEditar } from "../../_lib/perfis";
import { ROTULO_RESOLUCAO, type Resolucao } from "../../_lib/inventario";
import { docInventario, revisarInventario } from "../../_lib/inventario-servico";
import { cancelarInventarioAction, concluirContagemAction, fecharInventarioAction, incluirLoteAction, salvarContagemAction } from "../actions";
import { idInt } from "@/lib/ids";

const entrada =
  "h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25";

type Revisao = Awaited<ReturnType<typeof revisarInventario>>;
type Item = Revisao["itens"][number];

const Produto = ({ i }: { i: Item }) => (
  <Td className="max-w-xs">
    <div className="truncate font-medium text-slate-900">{i.produto.descricao}</div>
    <div className="font-mono text-xs text-slate-500">{i.produto.codigo} · lote {i.lote.numero} · val. {date(i.lote.validade)}</div>
  </Td>
);
const Dif = ({ i }: { i: Item }) =>
  i.calc.diferenca === null ? <span className="text-slate-400">—</span> : (
    <span className={cx("font-semibold", i.calc.diferenca < 0 && "text-rose-600", i.calc.diferenca > 0 && "text-amber-700")}>{i.calc.diferenca > 0 ? "+" : ""}{num(i.calc.diferenca)}</span>
  );
const SaldoAtual = ({ i }: { i: Item }) => (
  <span className={cx(i.calc.saldoMudou && "font-semibold text-amber-700")} title={i.calc.saldoMudou ? `Era ${i.saldoSistema} na foto` : undefined}>
    {num(i.saldoAtual)}
    {i.calc.saldoMudou && <span className="ml-1 text-xs font-normal">(foto {num(i.saldoSistema)})</span>}
  </span>
);

export default async function InventarioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER_INVENTARIO);
  const id = idInt((await params).id);
  if (!id) notFound();
  const rev = await revisarInventario(db, id).catch(() => null);
  if (!rev) notFound();
  const { inv, itens, resumo, foraDaFoto } = rev;
  const andamento = inv.status === "ABERTO" || inv.status === "CONTADO";
  const edita = podeEditar(user.perfil) && andamento;
  const lotes = edita
    ? await db.lote.findMany({ include: { produto: { select: { codigo: true, descricao: true } } }, orderBy: [{ produto: { descricao: "asc" } }, { validade: "asc" }], take: 1000 })
    : [];
  const doc = docInventario(inv.id);
  const nomeHosp = inv.hospital.nomeFantasia ?? inv.hospital.razaoSocial;
  const divergentes = itens.filter((i) => (i.calc.diferenca ?? 0) !== 0);
  const totalCobrar = itens.reduce((v, i) => v + toNumber(i.valorCobrar), 0);

  return (
    <>
      <PageHeader
        title={`Inventário ${doc}`}
        voltar={{ href: "/estoque/inventario", label: "Inventário" }}
        subtitle={`${nomeHosp} · criado em ${dateTime(inv.criadoEm)} por ${inv.criadoPor}`}
        actions={
          <>
            <StatusBadge status={inv.status} />
            {andamento && <LinkButton href={`/estoque/inventario/${inv.id}/imprimir`} variant="secondary" icon="impressora">Folha de contagem</LinkButton>}
            {edita && inv.status === "ABERTO" && (
              <ActionButton action={concluirContagemAction} hidden={{ id: inv.id }} variant="primary" confirm="Concluir a contagem? Todos os itens precisam ter quantidade (0 para o que não foi encontrado).">
                Concluir contagem
              </ActionButton>
            )}
          </>
        }
        maisAcoes={
          edita && (
            <ActionButton action={cancelarInventarioAction} hidden={{ id: inv.id }} variant="secondary" confirm="Cancelar este inventário? Nenhum ajuste de estoque será feito.">
              Cancelar
            </ActionButton>
          )
        }
      />
      <KpiGrid>
        <Stat icon="lista" label="Itens contados" value={`${num(resumo.contados)} / ${num(resumo.itens)}`} hint={inv.contadoEm ? `contagem concluída em ${dateTime(inv.contadoEm)}` : "contagem em andamento"} tone={resumo.naoContados && andamento ? "warn" : "default"} />
        <Stat icon="alerta" label="Divergências" value={num(resumo.divergentes)} hint={`${num(resumo.unidadesFalta)} un. a menos · ${num(resumo.unidadesSobra)} un. a mais`} tone={resumo.divergentes ? "danger" : "default"} />
        <Stat icon="pagar" label="Perdas (faltas ao custo)" value={money(resumo.valorFalta)} hint={`sobras: ${money(resumo.valorSobra)}`} tone={resumo.valorFalta ? "danger" : "default"} />
        <Stat label={inv.status === "FECHADO" ? "A cobrar do hospital" : "Situação"} value={inv.status === "FECHADO" ? money(totalCobrar) : <StatusBadge status={inv.status} />} hint={inv.status === "FECHADO" ? `fechado em ${dateTime(inv.fechadoEm)} por ${inv.fechadoPor}` : inv.status === "CANCELADO" ? `cancelado em ${dateTime(inv.canceladoEm)}` : "ainda não fechado"} />
      </KpiGrid>

      {andamento && resumo.saldoMudou > 0 && (
        <Aviso tom="alerta" className="mb-4">
          O saldo do sistema mudou depois da foto em {resumo.saldoMudou} item(ns) (remessa, retorno ou consumo). A divergência abaixo é calculada contra o saldo de hoje; a coluna mostra o valor da foto entre parênteses.
        </Aviso>
      )}
      {andamento && foraDaFoto > 0 && (
        <Aviso tom="alerta" className="mb-4">
          Há {foraDaFoto} lote(s) com saldo no hospital que não estavam na foto (entraram depois). Eles não fazem parte deste inventário.
        </Aviso>
      )}
      {inv.observacao && <p className="mb-3 text-sm text-slate-600">Observação: {inv.observacao}</p>}

      <div className="space-y-3">
        {edita ? (
          <Form action={salvarContagemAction.bind(null, inv.id)} submitLabel="Salvar contagem">
            <Table titulo="Contagem" icone="lista" contagem={itens.length} head={["Produto / lote", "Saldo no sistema", "Contado", "Diferença", "Valor"]} empty={itens.length === 0} emptyText="Este hospital não tinha saldo na foto. Inclua abaixo o material encontrado.">
              {itens.map((i) => (
                <tr key={i.id}>
                  <Produto i={i} />
                  <Td className="tnum text-right"><SaldoAtual i={i} /></Td>
                  <Td className="text-right">
                    <input name={`c_${i.id}`} type="number" min="0" step="1" inputMode="numeric" defaultValue={i.contado ?? ""} aria-label={`Contado: ${i.produto.descricao} lote ${i.lote.numero}`} className={cx(entrada, "tnum w-24 text-right")} />
                  </Td>
                  <Td className="tnum text-right"><Dif i={i} /></Td>
                  <Td className="tnum text-right">{i.calc.diferenca ? money(i.calc.valor) : "—"}</Td>
                </tr>
              ))}
            </Table>
          </Form>
        ) : (
          <Table
            titulo="Itens"
            icone="lista"
            contagem={itens.length}
            head={["Produto / lote", "Foto", inv.status === "FECHADO" ? "Saldo no fechamento" : "Saldo atual", "Contado", "Diferença", "Valor", "Resolução", "A cobrar"]}
            empty={itens.length === 0}
          >
            {itens.map((i) => (
              <tr key={i.id}>
                <Produto i={i} />
                <Td className="tnum text-right">{num(i.saldoSistema)}</Td>
                <Td className="tnum text-right">{num(i.saldoAtual)}</Td>
                <Td className="tnum text-right">{i.contado === null ? "—" : num(i.contado)}</Td>
                <Td className="tnum text-right"><Dif i={i} /></Td>
                <Td className="tnum text-right">{i.calc.diferenca ? money(i.calc.valor) : "—"}</Td>
                <Td className="max-w-xs">
                  {i.resolucao ? (
                    <>
                      <Badge color={i.resolucao === "AJUSTE" ? "yellow" : i.resolucao === "COBRAR_HOSPITAL" ? "red" : "gray"}>{ROTULO_RESOLUCAO[i.resolucao as Resolucao]}</Badge>
                      {i.justificativa && <div className="truncate text-xs text-slate-500" title={i.justificativa}>{i.justificativa}</div>}
                    </>
                  ) : "—"}
                </Td>
                <Td className="tnum text-right">{i.valorCobrar ? money(toNumber(i.valorCobrar)) : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}

        {edita && (
          <Card title="Incluir lote encontrado" icon="mais">
            <Form action={incluirLoteAction.bind(null, inv.id)} submitLabel="Incluir" resetOnSuccess>
              <Grid cols={3}>
                <Select label="Lote *" name="loteId" required className="sm:col-span-2" options={lotes.map((l) => ({ value: l.id, label: `${l.produto.codigo} — ${l.produto.descricao} · lote ${l.numero} · val. ${date(l.validade)}` }))} />
                <Field label="Quantidade encontrada *" name="contado" type="number" min="0" defaultValue={1} required />
              </Grid>
            </Form>
          </Card>
        )}

        {edita && inv.status === "CONTADO" && (
          <Form action={fecharInventarioAction.bind(null, inv.id)} submitLabel={null}>
            <Table
              titulo="Revisão e fechamento"
              icone="escudo"
              contagem={divergentes.length}
              head={["Produto / lote", "Saldo agora", "Contado", "Diferença", "Valor", "Resolução", "Justificativa"]}
              empty={divergentes.length === 0}
              emptyText="Sem divergências: a contagem confere com o saldo do sistema. Pode fechar."
            >
              {divergentes.map((i) => (
                <tr key={i.id}>
                  <Produto i={i} />
                  <Td className="tnum text-right"><SaldoAtual i={i} /></Td>
                  <Td className="tnum text-right">{num(i.contado ?? 0)}</Td>
                  <Td className="tnum text-right"><Dif i={i} /></Td>
                  <Td className="tnum text-right">{money(i.calc.valor)}</Td>
                  <Td>
                    <select name={`res_${i.id}`} defaultValue="" required aria-label="Resolução" className={cx(entrada, "min-w-44")}>
                      <option value="" disabled>Escolha...</option>
                      <option value="AJUSTE">{ROTULO_RESOLUCAO.AJUSTE}</option>
                      {(i.calc.diferenca ?? 0) < 0 && <option value="COBRAR_HOSPITAL">{ROTULO_RESOLUCAO.COBRAR_HOSPITAL}</option>}
                      <option value="JUSTIFICADA">{ROTULO_RESOLUCAO.JUSTIFICADA}</option>
                    </select>
                  </Td>
                  <Td><input name={`just_${i.id}`} maxLength={300} placeholder="Obrigatória se justificada" aria-label="Justificativa" className={cx(entrada, "w-64")} /></Td>
                </tr>
              ))}
            </Table>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton confirm={`Fechar o inventário ${doc}? Os ajustes serão lançados no kardex e o inventário não poderá mais ser alterado.`}>Fechar inventário</SubmitButton>
              <span className="text-xs text-slate-600">
                Perdas: {money(resumo.valorFalta)} em faltas · {money(resumo.valorSobra)} em sobras. A divergência é recalculada contra o saldo no momento do fechamento.
              </span>
            </div>
          </Form>
        )}
        {inv.status === "ABERTO" && edita && <p className="text-xs text-slate-600">Salve a contagem antes de concluir. Concluída a contagem, a revisão e o fechamento aparecem aqui.</p>}
      </div>
    </>
  );
}
