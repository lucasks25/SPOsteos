import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LOCAIS } from "@/lib/estoque";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { Badge, Card, Dl, LinkButton, PageHeader, SectionTitle, StatusBadge, Table, Td } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { PERFIS_QUALIDADE } from "../../_lib/perfis";
import { inspecionarLote } from "../actions";

export default async function InspecaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(PERFIS_QUALIDADE);
  const { id } = await params;
  const lote = await db.lote.findUnique({
    where: { id },
    include: {
      produto: { include: { fabricante: true } },
      saldos: { where: { localId: LOCAIS.QUARENTENA } },
      inspecoes: { orderBy: { criadoEm: "desc" } },
    },
  });
  if (!lote) notFound();
  const hoje = hojeUTC();
  const qtd = lote.saldos.reduce((s, x) => s + x.quantidade, 0);
  const vencido = lote.validade < hoje;
  const regVencido = lote.produto.validadeRegistro ? lote.produto.validadeRegistro < hoje : false;
  const podeLiberar = !vencido && !regVencido;

  return (
    <>
      <PageHeader
        title={`Inspeção do lote ${lote.numero}`}
        subtitle={`${lote.produto.codigo} — ${lote.produto.descricao}`}
        actions={
          <LinkButton href={`/qualidade/lotes/${lote.id}`} variant="secondary">
            Ver detalhes do lote
          </LinkButton>
        }
      />
      <div className="space-y-4">
        <Card title="Dados do lote">
          <Dl
            items={[
              ["Status", <StatusBadge key="s" status={lote.status} />],
              ["Quantidade em quarentena", num(qtd)],
              ["Série", lote.serie ?? "—"],
              ["Fabricação", date(lote.fabricacao)],
              ["Validade", <span key="v">{date(lote.validade)} {vencido && <Badge color="red">vencido</Badge>}</span>],
              ["Fabricante", lote.produto.fabricante?.nome ?? "—"],
              ["Registro ANVISA", lote.produto.registroAnvisa ?? "—"],
              ["Validade do registro", <span key="r">{date(lote.produto.validadeRegistro)} {regVencido && <Badge color="red">vencido</Badge>}</span>],
              ["Classe de risco", lote.produto.classeRisco ?? "—"],
            ]}
          />
          {!podeLiberar && (
            <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              Este lote não pode ser liberado: {vencido ? "lote vencido" : "registro ANVISA do produto vencido"}. Registre como não conforme ou bloqueado.
            </div>
          )}
        </Card>

        <Card title="Registrar inspeção">
          <Form action={inspecionarLote.bind(null, lote.id)} submitLabel="Registrar inspeção">
            <div className="flex flex-wrap gap-6">
              <Field label="Embalagem íntegra" name="embalagemOk" type="checkbox" defaultChecked />
              <Field label="Rotulagem conforme (ANVISA/UDI)" name="rotulagemOk" type="checkbox" defaultChecked />
              <Field label="Documentação conforme (NF, certificado)" name="documentacaoOk" type="checkbox" defaultChecked />
            </div>
            <Grid cols={3}>
              <Select
                label="Resultado *"
                name="resultado"
                required
                options={[
                  ...(podeLiberar ? [{ value: "LIBERADO", label: "Liberado → Depósito" }] : []),
                  { value: "NAO_CONFORME", label: "Não conforme → Estoque não conforme" },
                  { value: "BLOQUEADO", label: "Bloqueado → Estoque não conforme" },
                ]}
              />
            </Grid>
            <TextArea label="Observação" name="observacao" />
            <p className="text-xs text-slate-600">
              Ao registrar, todo o saldo em quarentena ({num(qtd)}) será transferido conforme o resultado.
            </p>
          </Form>
        </Card>

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
