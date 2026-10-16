import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionButton, Field, Form, Select } from "@/components/form";
import { Aviso, Badge, Card, Dl, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { date, dateTime, money, num } from "@/lib/format";
import { nomeHospital } from "@/app/(app)/cadastros/_lib/publico";
import { hojeUTC } from "@/lib/datas";
import { cancelarCirurgia, confirmarCirurgia, faturar, registrarConsumo, removerConsumo } from "../actions";
import { enviarAnexo, excluirAnexo } from "../anexos-actions";
import { riscoGlosaDaCirurgia } from "../../_lib/autorizacao-servico";
import { textoAvisoFaturamento } from "../../_lib/autorizacao-view";
import { AutorizacaoCard } from "./autorizacao-card";

export default async function CirurgiaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO", "ESTOQUE"]);
  const { id } = await params;
  const c = await db.cirurgia.findUnique({
    where: { id },
    include: {
      hospital: { include: { local: true } },
      medico: true,
      convenio: true,
      procedimento: true,
      representante: true,
      remessas: { include: { local: true, _count: { select: { itens: true } } }, orderBy: { id: "desc" } },
      consumos: { include: { produto: true, lote: true }, orderBy: { produto: { descricao: "asc" } } },
      anexos: { orderBy: { criadoEm: "desc" } },
      pedido: true,
    },
  });
  if (!c) notFound();

  const risco = await riscoGlosaDaCirurgia(c.id);
  const pode = (perfis: string[]) => user.perfil === "ADMIN" || perfis.includes(user.perfil);
  const comercial = pode(["COMERCIAL"]);
  const editavel = c.status !== "FATURADA" && c.status !== "CANCELADA";
  const pedidoAtivo = c.pedido && c.pedido.status !== "CANCELADO" ? c.pedido : null;
  const podeFaturar = c.status === "REALIZADA" && c.consumos.length > 0 && !pedidoAtivo && pode(["COMERCIAL", "FINANCEIRO"]);
  const vazioAguardandoVale = c.remessas.every((r) => r.status === "CANCELADA") && ["AGENDADA", "CONFIRMADA"].includes(c.status);
  const verEstoque = pode(["ESTOQUE", "COMERCIAL", "QUALIDADE"]);
  const podeConsumir = ["AGENDADA", "CONFIRMADA", "REALIZADA"].includes(c.status) && pode(["COMERCIAL", "ESTOQUE"]);

  // estoque consignado disponível no hospital (lotes liberados e dentro da validade)
  const saldos =
    podeConsumir && c.hospital.local
      ? await db.saldo.findMany({
          where: { localId: c.hospital.local.id, quantidade: { gt: 0 }, lote: { status: "LIBERADO", validade: { gte: hojeUTC() } } },
          include: { produto: true, lote: true },
          orderBy: [{ produto: { descricao: "asc" } }, { lote: { validade: "asc" } }],
        })
      : [];

  return (
    <>
      <PageHeader
        title={`Cirurgia CIR-${c.numero}`}
        subtitle={`${c.paciente} — ${dateTime(c.dataHora)}`}
        voltar={{ href: "/comercial/cirurgias", label: "Cirurgias" }}
        actions={
          <>
            {comercial && editavel && <LinkButton href={`/comercial/cirurgias/${c.id}/editar`} variant="secondary">Editar</LinkButton>}
            {comercial && c.status === "AGENDADA" && <ActionButton action={confirmarCirurgia.bind(null, c.id)} variant="primary">Confirmar</ActionButton>}
            {podeFaturar && (
              <ActionButton action={faturar.bind(null, c.id)} variant="primary" confirm={risco.grave ? textoAvisoFaturamento(risco.achados, "gerar o pedido de venda") : "Gerar o pedido de venda a partir do consumo?"}>Faturar</ActionButton>
            )}
          </>
        }
        maisAcoes={
          comercial && editavel && c.consumos.length === 0 ? (
            <ActionButton action={cancelarCirurgia.bind(null, c.id)} variant="danger" confirm="Cancelar esta cirurgia?">Cancelar cirurgia</ActionButton>
          ) : undefined
        }
      />

      <KpiGrid>
        <Stat icon="atividade" label="Situação" value={<StatusBadge status={c.status} />} hint={dateTime(c.dataHora)} />
        <Stat icon="caminhao" label="Remessas / vales" value={c.remessas.length} hint={<span className={c.remessas.length === 0 && editavel ? "text-amber-700" : undefined}>{c.remessas.length ? `${c.remessas.filter((r) => r.status === "CONFERIDA").length} conferida(s)` : "nenhum vale gerado"}</span>} />
        <Stat icon="frasco" label="Material consumido" value={`${num(c.consumos.reduce((n, k) => n + k.quantidade, 0))} un.`} hint={`${c.consumos.length} lote(s)`} />
        <Stat icon="carrinho" label="Pedido de venda" value={<span className="text-base">{c.pedido ? `PV-${c.pedido.id}` : "—"}</span>} hint={c.pedido ? (c.pedido.numeroNf ? `NF ${c.pedido.numeroNf}` : c.pedido.status.toLowerCase()) : podeFaturar ? <span className="text-amber-700">pronta para faturar</span> : "ainda não faturada"} />
      </KpiGrid>

      <div className="space-y-4">
        <Card title="Dados da cirurgia" icon="atividade" actions={<StatusBadge status={c.status} />}>
          <Dl
            items={[
              ["Data/hora", dateTime(c.dataHora)],
              ["Hospital", nomeHospital(c.hospital)],
              ["Médico", `${c.medico.nome} — CRM ${c.medico.crm}/${c.medico.ufCrm}`],
              ["Paciente", <>{c.paciente} {c.sus && <Badge color="blue">SUS</Badge>}</>],
              ["Carteirinha", c.carteirinha ?? "—"],
              ["Convênio", c.convenio?.nome ?? "—"],
              ["Procedimento", c.procedimento ? `${c.procedimento.codigoTuss ? c.procedimento.codigoTuss + " — " : ""}${c.procedimento.descricao}` : "—"],
              ["Representante", c.representante?.nome ?? "—"],
              ["Observação", c.observacao ?? "—"],
            ]}
          />
        </Card>

        <AutorizacaoCard
          cirurgiaId={c.id}
          dataHora={c.dataHora}
          convenio={c.convenio ? { nome: c.convenio.nome, exigeAutorizacao: c.convenio.exigeAutorizacao } : null}
          risco={risco}
          podeEditar={comercial && c.status !== "CANCELADA"}
        />

        {vazioAguardandoVale && (
          <Aviso tom="alerta">
            Vale pendente: o Estoque gera o vale desta cirurgia.
            {verEstoque && <> <Link href="/estoque/remessas" className="font-medium underline">Ver cirurgias aguardando vale no Estoque</Link></>}
          </Aviso>
        )}

        <Table
          titulo="Remessas / vales de consignação"
          icone="caminhao"
          contagem={c.remessas.length}
          head={["Remessa", "Local", "Itens", "Situação", "Enviada em", "Ações"]}
          empty={c.remessas.length === 0}
          emptyText="Nenhuma remessa/vale gerado para esta cirurgia."
        >
          {c.remessas.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/estoque/remessas/${r.id}`} className="font-mono text-xs font-semibold text-teal-700 hover:underline">REM-{r.id}</Link>
                <div className="text-xs text-slate-500">criada em {dateTime(r.criadoEm)}</div>
              </Td>
              <Td>{r.local.nome}</Td>
              <Td className="tnum text-right">{r._count.itens}</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td>{r.enviadaEm ? dateTime(r.enviadaEm) : "—"}</Td>
              <Td><LinkButton href={`/estoque/remessas/${r.id}`} variant="small">Abrir</LinkButton></Td>
            </tr>
          ))}
        </Table>

        <Table
          titulo="Consumo (material utilizado)"
          icone="frasco"
          contagem={c.consumos.length}
          head={["Produto", "Lote", "Validade", "Qtd.", "Ações"]}
          empty={c.consumos.length === 0}
          emptyText="Nenhum material consumido registrado ainda."
        >
          {c.consumos.map((k) => (
            <tr key={k.id}>
              <Td>
                <div className="font-medium">{k.produto.descricao}</div>
                <div className="font-mono text-xs text-slate-500">{k.produto.codigo}</div>
              </Td>
              <Td>{k.lote.numero}{k.lote.serie ? ` / série ${k.lote.serie}` : ""}</Td>
              <Td>{date(k.lote.validade)}</Td>
              <Td className="tnum text-right font-semibold">{num(k.quantidade)}</Td>
              <Td>
                {editavel && pode(["COMERCIAL", "ESTOQUE"]) && (
                  <ActionButton action={removerConsumo.bind(null, k.id)} variant="small" confirm="Remover este consumo e estornar ao estoque consignado do hospital?">
                    Remover
                  </ActionButton>
                )}
              </Td>
            </tr>
          ))}
        </Table>

        {podeConsumir && (
          <Card title="Registrar consumo direto" icon="mais">
            <div>
              <p className="mb-3 text-xs text-slate-600">
                Baixa a partir do estoque consignado já existente no hospital (lotes liberados e dentro da validade). Para material enviado em vale, registre o retorno na remessa.
              </p>
              {saldos.length === 0 ? (
                <p className="text-sm text-slate-600">Não há estoque consignado disponível neste hospital.</p>
              ) : (
                <Form action={registrarConsumo.bind(null, c.id)} submitLabel="Registrar consumo" resetOnSuccess>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem]">
                    <Select
                      label="Produto / lote *"
                      name="loteId"
                      required
                      options={saldos.map((s) => ({
                        value: s.loteId,
                        label: `${s.produto.codigo} — ${s.produto.descricao} | lote ${s.lote.numero} (val. ${date(s.lote.validade)}) — disp. ${s.quantidade}`,
                      }))}
                    />
                    <Field label="Quantidade *" name="quantidade" type="number" min="1" step="1" defaultValue={1} required />
                  </div>
                </Form>
              )}
            </div>
          </Card>
        )}

        <Card title="Anexos" icon="documento" actions={<span className="text-xs text-slate-600">PDF, JPG ou PNG até 10 MB</span>}>
          {c.anexos.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum anexo.</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm">
              {c.anexos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <a href={`/comercial/cirurgias/${c.id}/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                    {a.nome}
                  </a>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-600">{dateTime(a.criadoEm)}</span>
                    {pode(["COMERCIAL", "ESTOQUE"]) && (
                      <ActionButton action={excluirAnexo.bind(null, a.id)} variant="small" confirm="Excluir este anexo?">Excluir</ActionButton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pode(["COMERCIAL", "ESTOQUE"]) && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <Form action={enviarAnexo.bind(null, c.id)} submitLabel="Enviar anexo" resetOnSuccess>
                <Field label="Arquivo" name="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
              </Form>
            </div>
          )}
        </Card>

        <Card title="Pedido de venda" icon="carrinho">
          {c.pedido ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link href={`/comercial/pedidos/${c.pedido.id}`} className="font-mono text-xs text-teal-700 hover:underline">PV-{c.pedido.id}</Link>
              <StatusBadge status={c.pedido.status} />
              <span className="tnum">Total {money(c.pedido.total)}</span>
              {c.pedido.numeroNf && <span>NF {c.pedido.numeroNf}</span>}
              {c.pedido.status === "CANCELADO" && podeFaturar && <span className="text-xs text-slate-600">Pedido cancelado — é possível faturar novamente.</span>}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {c.status === "REALIZADA" && c.consumos.length > 0 ? "Pronta para faturar." : "O faturamento fica disponível quando a cirurgia estiver realizada e com consumo registrado."}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
