import Link from "next/link";
import { notFound } from "next/navigation";
import { Field, Form } from "@/components/form";
import { Badge, Card, Dl, KpiGrid, PageHeader, Stat, StatusBadge, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, dateTime, money, toNumber } from "@/lib/format";
import { cancelarRemessa } from "../../_lib/sispag-actions";
import { descreverOcorrencias, FORMAS_SISPAG, type FormaSispag } from "../../_lib/sispag";

const COR: Record<string, BadgeColor> = { ENVIADO: "gray", AGENDADO: "blue", PAGO: "green", REJEITADO: "red", CANCELADO: "gray" };

export default async function RemessaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
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
        title={`Remessa SISPAG #${r.id}`}
        subtitle={`${r.conta.nome} — ${r.modo === "PIX" ? "Pix" : "TED / crédito em conta / boletos"}`}
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
        <Stat label="Retorno" value={r.retornoEm ? dateTime(r.retornoEm) : "aguardando"} />
      </KpiGrid>
      {r.canceladaEm && (
        <p className="mb-4 rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Remessa cancelada em {dateTime(r.canceladaEm)}: {r.canceladaMotivo}. Não envie este arquivo ao banco; os títulos ficaram livres para outra remessa.
        </p>
      )}
      {alertas.length > 0 && (
        <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <strong>Atenção, dinheiro envolvido:</strong>
          <ul className="mt-1 list-disc pl-5">
            {alertas.map((i) => (
              <li key={i.id}>
                SP{i.id} — {i.contaPagar.descricao}: {descreverOcorrencias((i.ocorrencias ?? "").split(",").filter((c) => ["DUP", "CAN", "DIV"].includes(c)))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {podeCancelar && (
          <Card title="Cancelar remessa">
            <p className="mb-3 text-sm text-slate-600">Use se o banco recusou o arquivo ou se ele nunca foi enviado. Os títulos voltam a poder entrar em outra remessa. Se o arquivo já foi enviado e autorizado no banco, cancele o pagamento lá primeiro.</p>
            <Form action={cancelarRemessa.bind(null, r.id)} submitLabel="Cancelar remessa">
              <Field label="Motivo *" name="motivo" required minLength={5} maxLength={200} />
            </Form>
          </Card>
        )}
        <Card title="Como enviar">
          <Dl
            items={[
              ["1. Validar", "Itaú Empresas > Transmissão de arquivos > Validação (recomendado pelo manual antes do primeiro envio)"],
              ["2. Enviar", "Itaú Empresas > Transmissão de arquivos, ambiente Produção (ou Teste na implantação)"],
              ["3. Retorno", <Link key="r" href="/financeiro/remessas" className="text-teal-700 hover:underline">Importe o arquivo de retorno</Link>],
            ]}
          />
        </Card>
        <Table head={["Seu número", "Conta a pagar", "Fornecedor", "Forma", "Valor", "Situação no banco", "Ocorrências", "Título"]}>
          {r.itens.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono text-xs">SP{i.id}</Td>
              <Td className="max-w-xs truncate">
                <Link href={`/financeiro/pagar/${i.contaPagar.id}`} className="text-teal-700 hover:underline">
                  {i.contaPagar.descricao}
                </Link>
              </Td>
              <Td className="max-w-[12rem] truncate">{i.contaPagar.fornecedor ? i.contaPagar.fornecedor.nomeFantasia || i.contaPagar.fornecedor.razaoSocial : "—"}</Td>
              <Td>{FORMAS_SISPAG[i.forma as FormaSispag] ?? i.forma}</Td>
              <Td className="text-right tnum">{money(toNumber(i.valor))}</Td>
              <Td>
                <Badge color={COR[i.status]}>{i.status.toLowerCase()}</Badge>
              </Td>
              <Td className="max-w-sm whitespace-normal text-xs text-slate-600">{i.ocorrencias ? descreverOcorrencias(i.ocorrencias.split(",")) : "—"}</Td>
              <Td>
                <StatusBadge status={i.contaPagar.status} />
              </Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
