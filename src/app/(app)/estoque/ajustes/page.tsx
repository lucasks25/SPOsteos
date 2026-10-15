import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { date, dateTime, money, num } from "@/lib/format";
import { PERFIS_VER, podeEditar } from "../_lib/perfis";
import { registrarAjuste } from "./actions";

export default async function AjustesPage() {
  const user = await requireUser(PERFIS_VER);
  const [locais, lotes, ultimos] = await Promise.all([
    db.localEstoque.findMany({ orderBy: { nome: "asc" } }),
    db.lote.findMany({ include: { produto: { select: { codigo: true, descricao: true } } }, orderBy: [{ produto: { descricao: "asc" } }, { validade: "asc" }], take: 1000 }),
    db.movimento.findMany({
      where: { tipo: { in: ["AJUSTE", "PERDA"] } },
      include: { produto: { select: { codigo: true, descricao: true } }, lote: { select: { numero: true } }, origem: true, destino: true },
      orderBy: { criadoEm: "desc" },
      take: 50,
    }),
  ]);
  return (
    <>
      <PageHeader title="Ajustes e perdas" subtitle="Correções de inventário e baixas por perda, avaria ou extravio. Todo lançamento fica registrado no kardex." />
      <div className="space-y-6">
        {podeEditar(user.perfil) && (
          <Card title="Novo lançamento">
            <Form action={registrarAjuste} submitLabel="Registrar" resetOnSuccess>
              <Grid cols={3}>
                <Select
                  label="Operação *"
                  name="operacao"
                  required
                  options={[
                    { value: "ENTRADA", label: "Ajuste de entrada (+)" },
                    { value: "SAIDA", label: "Ajuste de saída (−)" },
                    { value: "PERDA", label: "Perda / avaria / extravio (−)" },
                  ]}
                />
                <Select label="Local *" name="localId" required options={locais.map((l) => ({ value: l.id, label: l.nome }))} />
                <Field label="Quantidade *" name="quantidade" type="number" min="1" defaultValue={1} required />
                <Select
                  label="Lote *"
                  name="loteId"
                  required
                  className="sm:col-span-3"
                  options={lotes.map((l) => ({ value: l.id, label: `${l.produto.codigo} — ${l.produto.descricao} · lote ${l.numero} · val. ${date(l.validade)}` }))}
                />
              </Grid>
              <TextArea label="Motivo / observação (obrigatório para perda)" name="observacao" maxLength={500} />
            </Form>
          </Card>
        )}
        <Card title="Últimos 50 lançamentos">
          <Table head={["Data/hora", "Tipo", "Produto", "Lote", "Local", "Qtd.", "Valor", "Motivo", "Usuário"]} empty={ultimos.length === 0} emptyText="Nenhum ajuste ou perda lançado até agora.">
            {ultimos.map((m) => {
              const entrada = !!m.destinoId;
              return (
                <tr key={m.id}>
                  <Td className="text-xs">{dateTime(m.criadoEm)}</Td>
                  <Td>{m.tipo === "PERDA" ? <Badge color="red">perda</Badge> : <Badge color="yellow">ajuste {entrada ? "+" : "−"}</Badge>}</Td>
                  <Td className="max-w-xs truncate">{m.produto.codigo} — {m.produto.descricao}</Td>
                  <Td className="font-mono text-xs">{m.lote.numero}</Td>
                  <Td>{(entrada ? m.destino : m.origem)?.nome ?? "—"}</Td>
                  <Td className="text-right font-semibold">{entrada ? "+" : "−"}{num(m.quantidade)}</Td>
                  <Td className="text-right">{money(Number(m.custoUnit) * m.quantidade)}</Td>
                  <Td className="max-w-xs truncate text-xs">{m.observacao ?? "—"}</Td>
                  <Td className="text-xs">{m.usuario ?? "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </>
  );
}
