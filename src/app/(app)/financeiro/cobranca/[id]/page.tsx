import Link from "next/link";
import { notFound } from "next/navigation";
import { Field, Form } from "@/components/form";
import { Badge, Card, KpiGrid, PageHeader, Stat, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, dateTime, money, toNumber } from "@/lib/format";
import { Celula } from "@/components/lista";
import { cancelarRemessaCobranca } from "../../_lib/cobranca-actions";
import { MOTIVOS_POR_OCORRENCIA } from "../../_lib/cobranca-tabelas";

const COR: Record<string, BadgeColor> = { ENVIADO: "gray", CONFIRMADO: "blue", LIQUIDADO: "green", REJEITADO: "red", BAIXADO: "gray", CANCELADO: "gray" };
const MARCAS: Record<string, string> = { DUP: "PAGO EM DUPLICIDADE: o título já estava quitado; peça a devolução", DIV: "Valor pago diferente do saldo: confira o título" };

function descrever(motivos: string | null) {
  if (!motivos) return "—";
  const tab = MOTIVOS_POR_OCORRENCIA["03"]?.codigos ?? {};
  return motivos
    .split(",")
    .flatMap((p) => p.split("+"))
    .map((c) => MARCAS[c] ?? `${c} — ${tab[c] ?? "ver tabela de motivos do manual de cobrança"}`)
    .join("; ");
}

export default async function RemessaCobrancaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const r = await db.remessaCobranca.findUnique({
    where: { id: Number(id) },
    include: { conta: { select: { nome: true } }, itens: { orderBy: { id: "asc" }, include: { contaReceber: { select: { id: true, descricao: true, vencimento: true, status: true, hospital: { select: { razaoSocial: true, nomeFantasia: true } } } } } } },
  });
  if (!r) notFound();
  const total = r.itens.filter((i) => i.ocorrencia === "01").reduce((s, i) => s + toNumber(i.valor), 0);
  const alertas = r.itens.filter((i) => /(^|,)(DUP|DIV)(,|$)/.test(i.motivos ?? ""));
  const podeCancelar = !r.canceladaEm && r.itens.every((i) => i.status === "ENVIADO");

  return (
    <>
      <PageHeader
        title={`Remessa de cobrança #${r.id}`}
        subtitle={r.conta.nome}
        actions={
          r.canceladaEm ? null : (
            <a href={`/financeiro/cobranca/${r.id}/arquivo`} className={btn.primary}>
              Baixar arquivo de remessa
            </a>
          )
        }
      />
      <KpiGrid cols={3}>
        <Stat label="Boletos" value={money(total)} hint={`${r.itens.filter((i) => i.ocorrencia === "01").length} título(s)`} />
        <Stat label="Gerada em" value={dateTime(r.criadaEm)} />
        <Stat label="Retorno" value={r.canceladaEm ? "Cancelada" : r.retornoEm ? dateTime(r.retornoEm) : "aguardando"} />
      </KpiGrid>
      {r.canceladaEm && <p className="mb-4 rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">Remessa cancelada em {dateTime(r.canceladaEm)}: {r.canceladaMotivo}. Não envie este arquivo ao banco.</p>}
      {alertas.length > 0 && (
        <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <strong>Atenção, dinheiro envolvido:</strong>
          <ul className="mt-1 list-disc pl-5">
            {alertas.map((i) => (
              <li key={i.id}>
                {i.contaReceber.descricao}: {descrever(i.motivos)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {podeCancelar && (
          <Card title="Cancelar remessa" icon="alerta">
            <p className="mb-3 text-sm text-slate-600">Use se o banco recusou o arquivo ou se ele nunca foi enviado. Os títulos voltam a poder entrar em outra remessa.</p>
            <Form action={cancelarRemessaCobranca.bind(null, r.id)} submitLabel="Cancelar remessa" confirm={`Cancelar a remessa de cobrança #${r.id}? Os boletos voltam a poder entrar em outra remessa. Não envie este arquivo ao banco.`}>
              <Field label="Motivo *" name="motivo" required minLength={5} maxLength={200} />
            </Form>
          </Card>
        )}
        {!r.canceladaEm && (
          <Card title="Como enviar" icon="info">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Itaú Empresas &gt; Transmissão de arquivos &gt; Validação: valide o layout antes do primeiro envio.</li>
            <li>Transmissão de arquivos: envie o arquivo (ambiente de teste na implantação, depois produção).</li>
            <li>Baixe o retorno do banco e importe em <Link href="/financeiro/cobranca" className="text-teal-700 hover:underline">Cobrança</Link>. Quando o registro for confirmado, o boleto fica disponível na conta a receber.</li>
          </ol>
        </Card>
        )}
        <Table titulo="Boletos da remessa" icone="receber" contagem={r.itens.length} head={["Nosso número", "Operação", "Título", "Valor", "Situação", "Observações"]}>
          {r.itens.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono text-xs">{i.nossoNumero}</Td>
              <Td>{i.ocorrencia === "01" ? "Registro" : "Pedido de baixa"}</Td>
              <Td className="max-w-xs">
                <Celula href={`/financeiro/receber/${i.contaReceber.id}`} principal={i.contaReceber.hospital ? i.contaReceber.hospital.nomeFantasia || i.contaReceber.hospital.razaoSocial : "Sem hospital"} sub={`${i.contaReceber.descricao} · vence ${date(i.contaReceber.vencimento)}`} />
              </Td>
              <Td className="text-right tnum font-medium">{money(toNumber(i.valor))}</Td>
              <Td>
                <Badge color={COR[i.status]}>{i.status.toLowerCase()}</Badge>
              </Td>
              <Td className="max-w-sm whitespace-normal text-xs text-slate-600">{descrever(i.motivos)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
