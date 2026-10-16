import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
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
      <PageHeader title="Ajustes e perdas" subtitle="Para o Estoque: correções de inventário e baixas por perda, avaria ou extravio. Todo lançamento fica registrado no kardex (histórico de movimentações)." />
      <KpiGrid cols={3}>
        <Stat icon="lista" label="Lançamentos recentes" value={num(ultimos.length)} hint="últimos 50" />
        <Stat icon="alerta" label="Perdas" value={num(ultimos.filter((m) => m.tipo === "PERDA").length)} hint={<span className="text-rose-600">{money(ultimos.filter((m) => m.tipo === "PERDA").reduce((v, m) => v + Number(m.custoUnit) * m.quantidade, 0))}</span>} />
        <Stat icon="ajustes" label="Ajustes" value={num(ultimos.filter((m) => m.tipo === "AJUSTE").length)} hint="entradas e saídas de inventário" />
      </KpiGrid>
      <div className="space-y-3">
        {podeEditar(user.perfil) && (
          <Card title="Novo lançamento" icon="ajustes">
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
        <Table titulo="Últimos 50 lançamentos" icone="lista" contagem={ultimos.length} head={["Data/hora", "Tipo", "Produto", "Local", "Qtd.", "Valor", "Motivo"]} empty={ultimos.length === 0} emptyText="Nenhum ajuste ou perda lançado até agora.">
          {ultimos.map((m) => {
            const entrada = !!m.destinoId;
            return (
              <tr key={m.id}>
                <Td>
                  <div>{dateTime(m.criadoEm)}</div>
                  <div className="text-xs text-slate-500">{m.usuario ?? "—"}</div>
                </Td>
                <Td>{m.tipo === "PERDA" ? <Badge color="red">perda</Badge> : <Badge color="yellow">ajuste {entrada ? "+" : "−"}</Badge>}</Td>
                <Td className="max-w-xs">
                  <div className="truncate font-medium text-teal-700">{m.produto.descricao}</div>
                  <div className="font-mono text-xs text-slate-500">{m.produto.codigo} · lote {m.lote.numero}</div>
                </Td>
                <Td>{(entrada ? m.destino : m.origem)?.nome ?? "—"}</Td>
                <Td className="tnum text-right font-semibold">{entrada ? "+" : "−"}{num(m.quantidade)}</Td>
                <Td className="tnum text-right">{money(Number(m.custoUnit) * m.quantidade)}</Td>
                <Td className="max-w-xs truncate text-xs">{m.observacao ?? "—"}</Td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
