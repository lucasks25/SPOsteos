import Link from "next/link";
import { notFound } from "next/navigation";
import { Field, Form } from "@/components/form";
import { Aviso, Badge, Card, Dl, KpiGrid, PageHeader, Stat, StatusBadge, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, dateTime, money, toNumber } from "@/lib/format";
import { Celula } from "@/components/lista";
import { cancelarRemessa } from "../../_lib/sispag-actions";
import { descreverOcorrencias, FORMAS_SISPAG, type FormaSispag } from "../../_lib/sispag";
import { idInt } from "@/lib/ids";

const COR: Record<string, BadgeColor> = { ENVIADO: "gray", AGENDADO: "blue", PAGO: "green", REJEITADO: "red", CANCELADO: "gray" };

export default async function RemessaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  if (!idInt(id)) notFound();
  const r = await db.remessaPagamento.findUnique({
    where: { id: Number(id) },
    include: {
      conta: { select: { nome: true } },
      itens: { orderBy: { id: "asc" }, include: { contaPagar: { select: { id: true, descricao: true, status: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } } } },
    },
  });
  if (!r) notFound();
  const total = r.itens.reduce((s, i) => s + toNumber(i.valor), 0);
  const pagos = r.itens.filter((i) => i.status === "PAGO");
  const alertas = r.itens.filter((i) => /(^|,)(DUP|CAN|DIV)(,|$)/.test(i.ocorrencias ?? ""));
  const podeCancelar = !r.canceladaEm && !r.itens.some((i) => i.status === "PAGO" || i.status === "AGENDADO");

  return (
    <>
      <PageHeader
        voltar={{ href: "/financeiro/remessas", label: "Remessas SISPAG" }}
        title={`Remessa SISPAG #${r.id}`}
        status={r.canceladaEm ? <Badge color="gray">Cancelada</Badge> : r.retornoEm ? <Badge color={alertas.length || r.itens.some((i) => i.status === "REJEITADO") ? "red" : "green"}>Retorno processado</Badge> : <Badge color="yellow">Aguardando retorno</Badge>}
        meta={[r.conta.nome, r.modo === "PIX" ? "Pix" : "TED / crédito em conta / boletos", `pagamento em ${date(r.dataPagto)}`]}
        actions={
          r.canceladaEm ? null : <a href={`/financeiro/remessas/${r.id}/arquivo`} className={btn.primary}>
            Baixar arquivo de remessa
          </a>
        }
      />
      <KpiGrid>
        <Stat label="Total" value={money(total)} hint={`${r.itens.length} pagamento(s)`} />
        <Stat label="Pago" value={money(pagos.reduce((s, i) => s + toNumber(i.valor), 0))} hint={`${pagos.length} confirmado(s)`} />
        <Stat label="Data do pagamento" value={date(r.dataPagto)} />
        <Stat label="Retorno do banco" value={r.canceladaEm ? "Cancelada" : r.retornoEm ? dateTime(r.retornoEm) : "Aguardando"} tone={!r.canceladaEm && !r.retornoEm ? "warn" : "default"} />
      </KpiGrid>
      {r.canceladaEm && (
        <Aviso tom="info" className="mb-4">
          Remessa cancelada em {dateTime(r.canceladaEm)}: {r.canceladaMotivo}. Não envie este arquivo ao banco; os títulos ficaram livres para outra remessa.
        </Aviso>
      )}
      {alertas.length > 0 && (
        <Aviso tom="erro" className="mb-4">
          <strong>Atenção, dinheiro envolvido:</strong>
          <ul className="mt-1 list-disc pl-5">
            {alertas.map((i) => (
              <li key={i.id}>
                SP{i.id} — {i.contaPagar.descricao}: {descreverOcorrencias((i.ocorrencias ?? "").split(",").filter((c) => ["DUP", "CAN", "DIV"].includes(c)))}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
      <div className="space-y-4">
        <Table titulo="Pagamentos da remessa" contagem={r.itens.length} head={["Seu número", "Conta a pagar", { label: "Forma", hideOnMobile: true }, "Valor", "Situação no banco", { label: "Ocorrências", hideOnMobile: true }, "Título"]} rodape={
          <tr>
            <td colSpan={3} className="px-4 py-1 text-slate-900">Total</td>
            <td className="tnum px-3 py-1 text-right text-slate-900">{money(total)}</td>
            <td colSpan={3} />
          </tr>
        }>
          {r.itens.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono text-xs">SP{i.id}</Td>
              <Td className="max-w-xs">
                <Celula href={`/financeiro/pagar/${i.contaPagar.id}`} principal={i.contaPagar.descricao} sub={i.contaPagar.fornecedor ? i.contaPagar.fornecedor.nomeFantasia || i.contaPagar.fornecedor.razaoSocial : "Sem fornecedor"} />
              </Td>
              <Td>{FORMAS_SISPAG[i.forma as FormaSispag] ?? i.forma}</Td>
              <Td className="text-right tnum font-medium">{money(toNumber(i.valor))}</Td>
              <Td>
                <Badge color={COR[i.status]}>{i.status.charAt(0) + i.status.slice(1).toLowerCase()}</Badge>
              </Td>
              <Td className="max-w-sm whitespace-normal text-xs text-slate-600">{i.ocorrencias ? descreverOcorrencias(i.ocorrencias.split(",")) : "—"}</Td>
              <Td>
                <StatusBadge status={i.contaPagar.status} />
              </Td>
            </tr>
          ))}
        </Table>
        <div className="grid items-start gap-4 lg:grid-cols-2">
        {podeCancelar && (
          <Card title="Cancelar remessa">
            <p className="mb-3 text-sm text-slate-600">Use se o banco recusou o arquivo ou se ele nunca foi enviado. Os títulos voltam a poder entrar em outra remessa. Se o arquivo já foi autorizado no banco, cancele o pagamento lá primeiro.</p>
            <Form action={cancelarRemessa.bind(null, r.id)} submitLabel="Cancelar remessa" submitVariant="danger" confirm={`Cancelar a remessa SISPAG #${r.id}? Os ${r.itens.length} pagamento(s) voltam a poder entrar em outra remessa. Se o arquivo já foi autorizado no banco, cancele o pagamento lá primeiro.`}>
              <Field label="Motivo *" name="motivo" required minLength={5} maxLength={200} />
            </Form>
          </Card>
        )}
        {!r.canceladaEm && (
          <Card title="Como enviar">
          <Dl
            cols={1}
            items={[
              ["1. Validar", "Itaú Empresas > Transmissão de arquivos > Validação (recomendado pelo manual antes do primeiro envio)"],
              ["2. Enviar", "Itaú Empresas > Transmissão de arquivos, ambiente Produção (ou Teste na implantação)"],
              ["3. Retorno", <Link key="r" href="/financeiro/remessas" className="text-teal-700 hover:underline">Importe o arquivo de retorno</Link>],
            ]}
          />
        </Card>
        )}
        </div>
      </div>
    </>
  );
}
