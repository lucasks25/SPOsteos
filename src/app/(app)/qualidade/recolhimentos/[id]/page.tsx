import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, Dl, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, cx } from "@/components/ui";
import { ActionButton, Field, Form, TextArea } from "@/components/form";
import { date, dateTime, num } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import {
  PERFIS_VER_RECOLHIMENTO,
  ROTULO_CLASSE,
  ROTULO_ORIGEM,
  docRecolhimento,
  encerrado,
  podeOperarRecolhimento,
  podeRecolherFisico,
  podeVerPacientes,
  prazoVencido,
  resumirRecolhimento,
} from "../../_lib/recolhimento";
import { pendenciasDoRecolhimento, situacaoAlvos } from "../../_lib/recolhimento-servico";
import { atualizarFotoAction, cancelarAction, comunicarPacientesAction, concluirAction, justificarAction, notaAction, recolherAction } from "../actions";

type SP = { aba?: string };
const ABAS = [
  ["lotes", "Lotes"],
  ["locais", "Locais com saldo"],
  ["pacientes", "Pacientes / cirurgias"],
  ["acoes", "Ações"],
] as const;

export default async function RecolhimentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser(PERFIS_VER_RECOLHIMENTO);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const situacao = await situacaoAlvos(db, id).catch(() => null);
  if (!situacao) notFound();
  const { rec, itens } = situacao;
  const verPac = podeVerPacientes(user.perfil);
  const opera = podeOperarRecolhimento(user.perfil);
  const recolhe = podeRecolherFisico(user.perfil);
  const ativo = !encerrado(rec.status);
  const abaPedida = (await searchParams).aba;
  const aba = ABAS.find(([k]) => k === abaPedida)?.[0] ?? "lotes";
  const hoje = hojeUTC();

  const [lotes, pacientes, acoes, pendencias] = await Promise.all([
    db.recolhimentoLote.findMany({ where: { recolhimentoId: id }, include: { lote: { include: { produto: { include: { fabricante: true } } } } }, orderBy: { lote: { numero: "asc" } } }),
    verPac
      ? db.recolhimentoPaciente.findMany({
          where: { recolhimentoId: id },
          include: { lote: { select: { numero: true } }, cirurgia: { include: { hospital: true, medico: true } } },
          orderBy: [{ cirurgia: { dataHora: "desc" } }],
        })
      : Promise.resolve([]),
    db.recolhimentoAcao.findMany({ where: { recolhimentoId: id }, orderBy: { criadoEm: "desc" } }),
    ativo ? pendenciasDoRecolhimento(db, id) : Promise.resolve([] as string[]),
  ]);
  const r = resumirRecolhimento(itens.map((i) => i.calc), pacientes);
  const pacTotal = verPac ? null : await db.recolhimentoPaciente.count({ where: { recolhimentoId: id } });
  const venc = prazoVencido(rec.prazo, rec.status, hoje);
  const doc = docRecolhimento(id);
  const hospitais = new Map(itens.filter((i) => i.local.tipo === "HOSPITAL").map((i) => [i.localId, i.local.hospital?.nomeFantasia ?? i.local.hospital?.razaoSocial ?? i.local.nome]));
  const nomeLocal = (i: (typeof itens)[number]) => i.local.hospital?.nomeFantasia ?? i.local.hospital?.razaoSocial ?? i.local.nome;
  const semRecolhido = itens.every((i) => i.quantidadeRecolhida === 0);

  return (
    <>
      <PageHeader
        title={`Recolhimento ${doc}`}
        subtitle={`${ROTULO_ORIGEM[rec.origem]} · classe ${rec.classe} · aberto em ${dateTime(rec.abertoEm)} por ${rec.abertoPor}`}
        actions={
          <>
            <StatusBadge status={rec.status} />
            <LinkButton href={`/qualidade/recolhimentos/${id}/relatorio`} variant="secondary" icon="impressora">{rec.status === "CONCLUIDO" ? "Relatório final" : "Relatório parcial"}</LinkButton>
            {opera && ativo && (
              <ActionButton action={atualizarFotoAction} hidden={{ id }} variant="secondary" confirm="Incluir na lista os locais com saldo e as cirurgias que surgiram depois da abertura?">
                Atualizar locais e pacientes
              </ActionButton>
            )}
          </>
        }
      />
      <KpiGrid cols={5}>
        <Stat label="Situação" value={<StatusBadge status={rec.status} />} hint={rec.prazo ? `prazo ${date(rec.prazo)}${venc ? " (vencido)" : ""}` : "sem prazo definido"} tone={venc ? "danger" : "default"} />
        <Stat label="Encontrado na abertura" value={num(r.encontrado)} hint={`${r.alvos} local(is) com saldo`} />
        <Stat label="Recolhido" value={num(r.recolhido)} hint="movido para o não conforme" />
        <Stat label="A recolher" value={num(r.aRecolher)} hint={`${r.alvosPendentes} local(is) pendente(s)`} tone={r.aRecolher && ativo ? "danger" : "default"} />
        <Stat label="Pacientes a comunicar" value={verPac ? num(r.pacientesAComunicar) : "—"} hint={verPac ? `${r.pacientes} cirurgia(s) com o lote` : `${num(pacTotal ?? 0)} cirurgia(s); nomes só para Qualidade`} tone={verPac && r.pacientesAComunicar && ativo ? "warn" : "default"} />
      </KpiGrid>

      <div className="space-y-3">
        <Card title="Dados da ação de campo" icon="alerta">
          <Dl
            items={[
              ["Origem", ROTULO_ORIGEM[rec.origem]],
              ["Classe de risco da ação", ROTULO_CLASSE[rec.classe]],
              ["Referência / alerta", rec.referencia],
              ["Prazo", rec.prazo ? (venc ? <Badge color="red">{date(rec.prazo)} · vencido</Badge> : date(rec.prazo)) : "—"],
              ["Motivo", rec.motivo],
              ["Observação", rec.observacao],
              ...(rec.status === "CONCLUIDO" ? ([["Concluído", `${dateTime(rec.concluidoEm)} por ${rec.concluidoPor}`], ["Parecer final", rec.conclusao]] as [string, string | null][]) : []),
              ...(rec.status === "CANCELADO" ? ([["Cancelado", `${dateTime(rec.canceladoEm)} por ${rec.canceladoPor}`], ["Motivo do cancelamento", rec.motivoCancelamento]] as [string, string | null][]) : []),
            ]}
          />
        </Card>

        <nav className="flex gap-1 border-b border-slate-200" aria-label="Seções">
          {ABAS.map(([k, label]) => (
            <Link key={k} href={`/qualidade/recolhimentos/${id}?aba=${k}`} className={cx("-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold", aba === k ? "border-teal-700 text-teal-700" : "border-transparent text-slate-600 hover:text-slate-900")}>
              {label}
            </Link>
          ))}
        </nav>

        {aba === "lotes" && (
          <Table titulo="Lotes bloqueados" icone="frasco" contagem={lotes.length} head={["Produto", "Lote", "Validade", "Status do lote", "Antes do recolhimento", "Bloqueado por este"]}>
            {lotes.map((l) => (
              <tr key={l.id}>
                <Td className="max-w-xs"><div className="truncate font-medium text-slate-900">{l.lote.produto.descricao}</div><div className="font-mono text-[11px] text-slate-500">{l.lote.produto.codigo} · reg. {l.lote.produto.registroAnvisa ?? "—"}</div></Td>
                <Td className="font-mono">{l.lote.numero}</Td>
                <Td>{date(l.lote.validade)}</Td>
                <Td><StatusBadge status={l.lote.status} /></Td>
                <Td><StatusBadge status={l.statusAnterior} /></Td>
                <Td>{l.bloqueadoPorEste ? "sim" : "já estava bloqueado"}</Td>
              </tr>
            ))}
          </Table>
        )}

        {aba === "locais" && (
          <>
            <Table
              titulo="Locais com saldo na abertura"
              icone="caixa"
              contagem={itens.length}
              head={["Local / hospital", "Produto / lote", "Na abertura", "Recolhido", "Saldo atual", "Situação", "Comunicado", "Ações"]}
              empty={itens.length === 0}
              emptyText="Nenhum saldo deste lote em depósito, quarentena ou hospital na abertura."
            >
              {itens.map((i) => (
                <tr key={i.id} className="align-top">
                  <Td>
                    <div className="font-medium text-slate-900">{nomeLocal(i)}</div>
                    <div className="text-[11px] text-slate-500">{i.local.tipo === "HOSPITAL" ? "consignado no hospital" : i.local.tipo.toLowerCase()}</div>
                  </Td>
                  <Td className="max-w-xs"><div className="truncate">{i.lote.produto.descricao}</div><div className="font-mono text-[11px] text-slate-500">lote {i.lote.numero}</div></Td>
                  <Td className="tnum text-right">{num(i.saldoAbertura)}</Td>
                  <Td className="tnum text-right">{num(i.quantidadeRecolhida)}</Td>
                  <Td className={cx("tnum text-right", i.mudou && ativo && "font-semibold text-amber-700")}>
                    <span title={i.mudou ? "O saldo mudou desde a abertura" : undefined}>{num(i.saldoAtual)}</span>
                    {i.mudou && ativo && <span className="ml-1 text-[11px] font-normal">(mudou)</span>}
                  </Td>
                  <Td>
                    <StatusBadge status={i.status} />
                    {i.justificativa && <div className="mt-1 max-w-48 whitespace-normal text-[11px] text-slate-600">Justificado: {i.justificativa}</div>}
                  </Td>
                  <Td>{i.comunicadoEm ? dateTime(i.comunicadoEm) : "—"}</Td>
                  <Td className="whitespace-normal">
                    <div className="flex flex-col gap-2">
                      {i.local.tipo === "HOSPITAL" && (opera || recolhe) && (
                        <Link href={`/qualidade/recolhimentos/${id}/comunicado/${i.localId}`} className="text-xs font-semibold text-teal-700 hover:underline">Comunicado do hospital</Link>
                      )}
                      {ativo && recolhe && i.saldoAtual > 0 && (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-teal-700">Registrar recolhimento</summary>
                          <div className="mt-2 w-56">
                            <Form action={recolherAction.bind(null, id, i.id)} submitLabel="Recolher para não conforme">
                              <Field label={`Quantidade (máx. ${i.saldoAtual})`} name="quantidade" type="number" min="1" max={i.saldoAtual} defaultValue={i.saldoAtual} required />
                            </Form>
                          </div>
                        </details>
                      )}
                      {ativo && opera && (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-slate-600">{i.justificativa ? "Editar justificativa" : "Justificar sem recolher"}</summary>
                          <div className="mt-2 w-56">
                            <Form action={justificarAction.bind(null, id, i.id)} submitLabel="Salvar justificativa">
                              <TextArea label="Justificativa (vazio remove)" name="justificativa" defaultValue={i.justificativa ?? ""} maxLength={500} />
                            </Form>
                          </div>
                        </details>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            {hospitais.size > 0 && <p className="text-xs text-slate-600">Para comunicar, abra o &quot;Comunicado do hospital&quot;, imprima e use &quot;Registrar como comunicado&quot; na própria tela. {hospitais.size} hospital(is) com material consignado.</p>}
          </>
        )}

        {aba === "pacientes" &&
          (verPac ? (
            <Card title="Pacientes e cirurgias que usaram o lote" icon="medico" actions={<span className="tnum text-xs text-slate-600">{pacientes.length} registro(s) · dados sensíveis (LGPD)</span>}>
              {pacientes.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma cirurgia usou estes lotes até agora.</p>
              ) : (
                <Form action={comunicarPacientesAction.bind(null, id)} submitLabel={ativo && opera ? "Marcar selecionados como comunicados" : null}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[13px]">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>{["", "Cirurgia", "Data", "Paciente", "Hospital", "Médico", "Lote", "Qtd.", "Comunicado"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[.04em] text-slate-600">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pacientes.map((p) => (
                          <tr key={p.id}>
                            <Td>{ativo && opera && !p.comunicadoEm ? <input type="checkbox" name={`p_${p.id}`} aria-label={`Selecionar ${p.cirurgia.paciente}`} className="h-4 w-4 rounded-sm border-slate-300" /> : null}</Td>
                            <Td><Link href={`/comercial/cirurgias/${p.cirurgiaId}`} className="font-mono text-teal-700 hover:underline">CIR-{p.cirurgia.numero}</Link></Td>
                            <Td>{date(p.cirurgia.dataHora)}</Td>
                            <Td className="font-medium text-slate-900">{p.cirurgia.paciente}</Td>
                            <Td>{p.cirurgia.hospital.nomeFantasia ?? p.cirurgia.hospital.razaoSocial}</Td>
                            <Td>{p.cirurgia.medico.nome}</Td>
                            <Td className="font-mono">{p.lote.numero}</Td>
                            <Td className="tnum text-right">{p.quantidade}</Td>
                            <Td>{p.comunicadoEm ? <><div>{dateTime(p.comunicadoEm)}</div>{p.observacao && <div className="max-w-48 truncate text-[11px] text-slate-500">{p.observacao}</div>}</> : <Badge color="yellow">pendente</Badge>}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {ativo && opera && <Field label="Observação da comunicação (opcional)" name="observacao" maxLength={300} hint="Ex.: médico avisado por telefone em 15/10, protocolo do hospital" />}
                </Form>
              )}
            </Card>
          ) : (
            <Card title="Pacientes e cirurgias" icon="medico"><p className="text-sm text-slate-600">{num(pacTotal ?? 0)} cirurgia(s) usaram os lotes. Os dados do paciente são sensíveis (LGPD) e ficam visíveis só para os perfis Qualidade e Admin.</p></Card>
          ))}

        {aba === "acoes" && (
          <>
            {ativo && opera && (
              <Card title="Registrar ação" icon="lista">
                <Form action={notaAction.bind(null, id)} submitLabel="Registrar" resetOnSuccess>
                  <TextArea label="O que foi feito (contato com fabricante, ligação ao hospital, notificação à ANVISA…)" name="texto" required maxLength={1000} />
                </Form>
              </Card>
            )}
            <Table titulo="Cronologia" icone="calendario" contagem={acoes.length} head={["Data", "Usuário", "Tipo", "Descrição"]} empty={acoes.length === 0}>
              {acoes.map((a) => (
                <tr key={a.id} className="align-top">
                  <Td>{dateTime(a.criadoEm)}</Td>
                  <Td>{a.usuario}</Td>
                  <Td><Badge>{a.tipo.toLowerCase()}</Badge></Td>
                  <Td className="whitespace-normal">{a.descricao}</Td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {ativo && opera && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Concluir recolhimento" icon="ok">
              {pendencias.length > 0 && (
                <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-rose-700">
                  {pendencias.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
                  {pendencias.length > 8 && <li>+{pendencias.length - 8} pendência(s)</li>}
                </ul>
              )}
              <Form action={concluirAction.bind(null, id)} submitLabel="Concluir (não pode ser desfeito)">
                <TextArea label="Parecer final *" name="conclusao" required maxLength={2000} />
              </Form>
            </Card>
            <Card title="Cancelar recolhimento" icon="alerta">
              {semRecolhido ? (
                <Form action={cancelarAction.bind(null, id)} submitLabel="Cancelar e desbloquear lotes">
                  <p className="text-[13px] text-slate-600">Só os lotes que este recolhimento bloqueou voltam ao status anterior.</p>
                  <TextArea label="Motivo do cancelamento *" name="motivo" required maxLength={500} />
                </Form>
              ) : (
                <p className="text-[13px] text-slate-600">Já houve recolhimento físico: não é possível cancelar. Conclua o recolhimento.</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
