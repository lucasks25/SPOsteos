import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, Dl, LinkButton, PageHeader, SectionTitle, StatusBadge, Table, Td } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { hojeUTC, PERFIS_QUALIDADE } from "../../_lib/datas";

export default async function LoteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(PERFIS_QUALIDADE);
  const { id } = await params;
  const lote = await db.lote.findUnique({
    where: { id },
    include: {
      produto: { include: { fabricante: true } },
      saldos: { include: { local: true }, orderBy: { quantidade: "desc" } },
      inspecoes: { orderBy: { criadoEm: "desc" } },
    },
  });
  if (!lote) notFound();
  const hoje = hojeUTC();
  const total = lote.saldos.reduce((s, x) => s + x.quantidade, 0);

  return (
    <>
      <PageHeader
        title={`Lote ${lote.numero}`}
        subtitle={`${lote.produto.codigo} — ${lote.produto.descricao}`}
        actions={
          <>
            {lote.status === "QUARENTENA" && <LinkButton href={`/qualidade/quarentena/${lote.id}`}>Inspecionar</LinkButton>}
            <LinkButton href={`/qualidade/rastreabilidade?q=${encodeURIComponent(lote.numero)}`} variant="secondary">
              Rastreabilidade
            </LinkButton>
          </>
        }
      />
      <div className="space-y-4">
        <Card title="Dados do lote">
          <Dl
            items={[
              ["Status", <StatusBadge key="s" status={lote.status} />],
              ["Saldo total", num(total)],
              ["Série", lote.serie ?? "—"],
              ["Fabricação", date(lote.fabricacao)],
              ["Validade", <span key="v">{date(lote.validade)} {lote.validade < hoje && <Badge color="red">vencido</Badge>}</span>],
              ["Cadastrado em", dateTime(lote.criadoEm)],
              ["Produto", <Link key="p" href={`/cadastros/produtos/${lote.produtoId}`} className="text-teal-700 hover:underline">{lote.produto.descricao}</Link>],
              ["Fabricante", lote.produto.fabricante?.nome ?? "—"],
              ["Registro ANVISA", `${lote.produto.registroAnvisa ?? "—"} (val. ${date(lote.produto.validadeRegistro)})`],
              ["GTIN", lote.produto.gtin ?? "—"],
            ]}
          />
        </Card>

        <div>
          <SectionTitle>Saldos por local</SectionTitle>
          <Table head={["Local", "Tipo", "Quantidade"]} empty={lote.saldos.length === 0}>
            {lote.saldos.map((s) => (
              <tr key={s.id}>
                <Td>{s.local.nome}</Td>
                <Td>{s.local.tipo.replaceAll("_", " ").toLowerCase()}</Td>
                <Td className="text-right font-medium">{num(s.quantidade)}</Td>
              </tr>
            ))}
          </Table>
        </div>

        <div>
          <SectionTitle>Histórico de inspeções</SectionTitle>
          <Table head={["Data", "Resultado", "Embalagem", "Rotulagem", "Documentação", "Inspetor", "Observação"]} empty={lote.inspecoes.length === 0} emptyText="Este lote ainda não foi inspecionado.">
            {lote.inspecoes.map((i) => (
              <tr key={i.id}>
                <Td>{dateTime(i.criadoEm)}</Td>
                <Td><StatusBadge status={i.resultado} /></Td>
                <Td>{i.embalagemOk ? "OK" : <Badge color="red">reprovado</Badge>}</Td>
                <Td>{i.rotulagemOk ? "OK" : <Badge color="red">reprovado</Badge>}</Td>
                <Td>{i.documentacaoOk ? "OK" : <Badge color="red">reprovado</Badge>}</Td>
                <Td>{i.inspetor}</Td>
                <Td className="whitespace-normal">{i.observacao ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}
