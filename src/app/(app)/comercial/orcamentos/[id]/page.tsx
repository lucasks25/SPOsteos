import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, Dl, cx, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { ItemAdder, produtoOptions } from "@/components/item-adder";
import { PrintButton } from "@/components/print-button";
import { date, dateTime, money, toNumber } from "@/lib/format";
import { opcoesConvenios, opcoesHospitais } from "../../_lib/opcoes";
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
      </div>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">Orçamento ORC-{o.id}</h1>
        <p className="text-sm">Emitido em {date(new Date())} · válido até {date(o.validade)}</p>
      </div>

      <div className="space-y-6">
        {edita && rascunho ? (
          <Card title="Dados do orçamento" className="print:hidden">
            <OrcamentoForm orc={o} hospitais={hospitais} convenios={convenios} />
          </Card>
        ) : null}
        <Card title="Destinatário" className={cx("print:shadow-none", edita && rascunho && "hidden print:block")}>
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
        <Card title="Itens" className="print:shadow-none">
          {edita && rascunho && (
            <div className="mb-4 print:hidden">
              <ItemAdder action={adicionarItemOrcamento.bind(null, id)} produtos={produtoOptions(produtos)} comPreco />
              <p className="mt-1 text-xs text-slate-600">Preço vazio = tabela do hospital (ou preço base).</p>
            </div>
          )}
          <Table head={["Código", "Produto", "Fabricante", "Reg. ANVISA", "Qtd.", "Preço unit.", "Subtotal", ...(edita && rascunho ? ["Ações"] : [])]} empty={o.itens.length === 0} emptyText="Nenhum item neste orçamento. Use o campo acima para incluir produtos.">
            {o.itens.map((i) => (
              <tr key={i.id}>
                <Td className="font-mono text-xs">{i.produto.codigo}</Td>
                <Td className="whitespace-normal">{i.produto.descricao}</Td>
                <Td>{i.produto.fabricante?.nome ?? "—"}</Td>
                <Td>{i.produto.registroAnvisa ?? "—"}</Td>
                <Td className="text-right">{i.quantidade}</Td>
                <Td className="text-right">{money(i.precoUnit)}</Td>
                <Td className="text-right font-semibold">{money(i.quantidade * toNumber(i.precoUnit))}</Td>
                {edita && rascunho && (
                  <Td className="print:hidden">
                    <ActionButton action={removerItemOrcamento.bind(null, i.id)} variant="small">Remover</ActionButton>
                  </Td>
                )}
              </tr>
            ))}
          </Table>
          <div className="tnum mt-4 text-right text-lg font-bold text-slate-900">Total: {money(total)}</div>
        </Card>
      </div>
    </>
  );
}
