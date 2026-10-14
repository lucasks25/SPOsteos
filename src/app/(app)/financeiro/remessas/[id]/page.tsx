import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Dl, PageHeader, Stat, StatusBadge, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, dateTime, money, toNumber } from "@/lib/format";
import { descreverOcorrencias, FORMAS_SISPAG, type FormaSispag } from "../../_lib/sispag";

const COR: Record<string, BadgeColor> = { ENVIADO: "gray", AGENDADO: "blue", PAGO: "green", REJEITADO: "red" };

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

  return (
    <>
      <PageHeader
        title={`Remessa SISPAG #${r.id}`}
        subtitle={`${r.conta.nome} — ${r.modo === "PIX" ? "Pix" : "TED / crédito em conta / boletos"}`}
        actions={
          <a href={`/financeiro/remessas/${r.id}/arquivo`} className={btn.primary}>
            Baixar arquivo de remessa
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total" value={money(total)} hint={`${r.itens.length} pagamento(s)`} />
        <Stat label="Pago" value={money(pagos.reduce((s, i) => s + toNumber(i.valor), 0))} hint={`${pagos.length} confirmado(s)`} />
        <Stat label="Data do pagamento" value={date(r.dataPagto)} />
        <Stat label="Retorno" value={r.retornoEm ? dateTime(r.retornoEm) : "aguardando"} />
      </div>
      <div className="space-y-6">
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
              <Td className="text-right tabular-nums">{money(toNumber(i.valor))}</Td>
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
