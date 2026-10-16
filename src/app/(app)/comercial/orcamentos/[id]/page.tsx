import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, Dl, KpiGrid, Stat, cx, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { PrintButton } from "@/components/print-button";
import { date, dateTime, diasAte, money, toNumber } from "@/lib/format";
import { opcoesConvenios, opcoesHospitais } from "@/app/(app)/cadastros/_lib/publico";
import { OrcamentoForm } from "../orcamento-form";
import { adicionarItemOrcamento, mudarStatusOrcamento, removerItemOrcamento } from "../actions";

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [o, produtos, hospitais, convenios] = await Promise.all([
    db.orcamento.findUnique({
      where: { id },
      include: { hospital: true, convenio: true, itens: { include: { produto: { include: { fabricante: true } } }, orderBy: { produto: { descricao: "asc" } } } },
    }),
    db.produto.findMany({ where: { ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    opcoesHospitais(),
    opcoesConvenios(),
  ]);
  if (!o) notFound();
  const edita = user.perfil === "ADMIN" || user.perfil === "COMERCIAL";
  const rascunho = o.status === "RASCUNHO";
  const total = o.itens.reduce((s, i) => s + i.quantidade * toNumber(i.precoUnit), 0);
  const status = (s: "RASCUNHO" | "ENVIADO" | "APROVADO" | "RECUSADO", label: string, variant: "primary" | "secondary" | "danger" = "secondary") => (
    <ActionButton action={mudarStatusOrcamento.bind(null, id, s)} variant={variant}>{label}</ActionButton>
  );

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Orçamento ORC-${o.id}`}
          subtitle={`${o.hospital.nomeFantasia ?? o.hospital.razaoSocial} · criado em ${dateTime(o.criadoEm)}`}
          actions={
            <>
              <StatusBadge status={o.status} />
              <PrintButton />
              {edita && o.status === "RASCUNHO" && status("ENVIADO", "Marcar como enviado", "primary")}
              {edita && o.status === "ENVIADO" && (
                <>
                  {status("APROVADO", "Aprovado", "primary")}
                  {status("RECUSADO", "Recusado", "danger")}
                  {status("RASCUNHO", "Voltar a rascunho")}
                </>
              )}
              {edita && o.status === "RECUSADO" && status("RASCUNHO", "Reabrir como rascunho")}
            </>
          }
        />
        <KpiGrid>
          <Stat label="Total" value={money(total)} hint={`${o.itens.length} item(ns)`} />
          <Stat label="Situação" value={<StatusBadge status={o.status} />} />
          <Stat label="Validade" value={o.validade ? date(o.validade) : "—"} hint={o.validade && diasAte(o.validade) < 0 && o.status !== "APROVADO" ? <span className="text-rose-600">vencida</span> : undefined} />
          <Stat label="Convênio" value={<span className="text-base">{o.convenio?.nome ?? "Particular"}</span>} hint={o.paciente ? `Paciente: ${o.paciente}` : undefined} />
        </KpiGrid>
      </div>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">Orçamento ORC-{o.id}</h1>
        <p className="text-sm">Emitido em {date(new Date())} · válido até {date(o.validade)}</p>
      </div>

      <div className="space-y-6">
        {edita && rascunho ? (
          <Card title="Dados do orçamento" icon="documento" className="print:hidden">
            <OrcamentoForm orc={o} hospitais={hospitais} convenios={convenios} />
          </Card>
        ) : null}
        <Card title="Destinatário" icon="predio" className={cx("print:shadow-none", edita && rascunho && "hidden print:block")}>
          <Dl
            items={[
              ["Hospital", `${o.hospital.razaoSocial} (CNPJ ${o.hospital.cnpj})`],
              ["Convênio", o.convenio?.nome ?? "—"],
              ["Paciente", o.paciente ?? "—"],
              ["Validade", date(o.validade)],
              ["Observação", o.observacao ?? "—"],
            ]}
          />
        </Card>
        {edita && rascunho && (
          <Card title="Incluir item" icon="mais" className="print:hidden">
            <ItemAdder action={adicionarItemOrcamento.bind(null, id)} produtos={produtoOptions(produtos)} comPreco />
            <p className="mt-1 text-xs text-slate-600">Preço vazio = tabela do hospital (ou preço base).</p>
          </Card>
        )}
        <Table
          titulo="Itens"
          icone="lista"
          contagem={o.itens.length}
          head={["Produto", "Fabricante", "Reg. ANVISA", "Qtd.", "Preço unit.", "Subtotal", ...(edita && rascunho ? ["Ações"] : [])]}
          empty={o.itens.length === 0}
          emptyText="Nenhum item neste orçamento. Use o campo acima para incluir produtos."
        >
          {o.itens.map((i) => (
            <tr key={i.id}>
              <Td className="whitespace-normal">
                <div className="font-medium text-teal-700 print:text-black">{i.produto.descricao}</div>
                <div className="font-mono text-[11px] text-slate-500">{i.produto.codigo}</div>
              </Td>
              <Td>{i.produto.fabricante?.nome ?? "—"}</Td>
              <Td>{i.produto.registroAnvisa ?? "—"}</Td>
              <Td className="tnum text-right">{i.quantidade}</Td>
              <Td className="tnum text-right">{money(i.precoUnit)}</Td>
              <Td className="tnum text-right font-semibold">{money(i.quantidade * toNumber(i.precoUnit))}</Td>
              {edita && rascunho && (
                <Td className="print:hidden">
                  <ActionButton action={removerItemOrcamento.bind(null, i.id)} variant="small">Remover</ActionButton>
                </Td>
              )}
            </tr>
          ))}
        </Table>
        <div className="tnum text-right text-lg font-bold text-slate-900">Total: {money(total)}</div>
      </div>
    </>
  );
}
