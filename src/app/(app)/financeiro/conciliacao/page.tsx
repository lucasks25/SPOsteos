import { ActionButton, Field, Form, Select } from "@/components/form";
import { Badge, Card, EmptyState, FilterBar, KpiGrid, LinkButton, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, num } from "@/lib/format";
import { carregarConciliacao } from "../_lib/conciliacao";
import { opcoesClassificacao } from "../_lib/plano";
import { desfazerConciliacao, importarExtrato } from "../_lib/conciliacao-actions";
import { SemRecuo } from "@/components/lista";
import { LinhaPendente } from "./linha";

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const contas = await db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  const escolhida = typeof sp.conta === "string" ? contas.find((c) => c.id === sp.conta) : contas[0];

  if (!escolhida) {
    return (
      <>
        <PageHeader title="Conciliação bancária" subtitle="Compare o extrato do banco com o que foi baixado no sistema." />
        <Card>
          <EmptyState
            text="Nenhuma conta bancária cadastrada. Cadastre uma para importar o extrato e conciliar."
            action={<LinkButton href="/financeiro/contas/nova">Cadastrar conta bancária</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const d = await carregarConciliacao(escolhida.id);
  const { planos, centros } = await opcoesClassificacao(db);
  return (
    <>
      <PageHeader title="Conciliação bancária" subtitle="Importe o extrato do banco (OFX ou CNAB 240) e case cada linha com uma baixa, um título ou um lançamento avulso." actions={<LinkButton href="/financeiro/contas" variant="secondary">Contas bancárias</LinkButton>} />

      <FilterBar>
        <Select label="Conta" name="conta" defaultValue={escolhida.id} options={contas.map((c) => ({ value: c.id, label: c.nome }))} placeholder="" className="w-64" />
        <button className={btn.secondary}>Trocar conta</button>
      </FilterBar>

      <KpiGrid cols={3}>
        <Stat icon="conciliar" label="Para conciliar" value={num(d.pendTotal)} tone={d.pendTotal > 0 ? "warn" : "default"} hint="linhas do extrato sem vínculo" />
        <Stat icon="ok" label="Conciliadas" value={num(d.concTotal)} />
        <Stat icon="banco" label="Lançamentos sem extrato" value={num(d.semExtrato)} hint="baixas ainda não vistas no banco" />
      </KpiGrid>

      <div className="space-y-3">
        <Card title="Pendentes de conciliação" icon="conciliar" actions={<span className="tnum text-xs text-slate-600">{d.pendTotal} {d.pendTotal === 1 ? "item" : "itens"}{d.pendTotal > 100 && " (100 mais antigas)"}</span>}>
          <SemRecuo>
          {d.pendentes.length === 0 ? (
            <div className="px-4 py-10">
              <EmptyState icon="ok" text="Nada pendente nesta conta. Importe um novo extrato quando tiver." />
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {d.pendentes.map((p) => (
                <LinhaPendente key={p.linha.id} linha={p.linha} sugLanc={p.sugLanc} exatos={p.exatos} titulos={p.titulos} planos={planos} centros={centros} />
              ))}
            </div>
          )}
          </SemRecuo>
        </Card>

        <Table
          titulo="Últimas conciliadas"
          icone="ok"
          contagem={d.conciliadas.length}
          head={["Data", "Extrato", "Valor", "Lançamento vinculado", ""]}
          empty={d.conciliadas.length === 0}
          emptyText="Nenhuma linha conciliada ainda nesta conta."
        >
          {d.conciliadas.map((l) => (
            <tr key={l.id}>
              <Td>{date(l.data)}</Td>
              <Td className="max-w-xs truncate">{l.descricao}</Td>
              <Td className={`text-right tnum font-medium ${l.valor > 0 ? "text-emerald-700" : "text-rose-600"}`}>{money(l.valor)}</Td>
              <Td className="max-w-xs truncate">
                <Badge color="green">conciliada</Badge> <span className="text-slate-600">{l.vinculo}</span>
              </Td>
              <Td className="text-right">
                <ActionButton action={desfazerConciliacao.bind(null, l.id)} variant="small" confirm="Desfazer esta conciliação?">
                  Desfazer
                </ActionButton>
              </Td>
            </tr>
          ))}
        </Table>

        <Card title="Importar extrato (OFX ou CNAB 240 Itaú)" icon="baixar">
          <Form action={importarExtrato} submitLabel="Importar" resetOnSuccess>
            <input type="hidden" name="contaId" value={escolhida.id} />
            <Field label="Arquivo do extrato" name="arquivo" type="file" accept=".ofx,.OFX,.ret,.RET,.txt,.TXT,.cnab,.CNAB" required hint="OFX do internet banking ou arquivo de retorno CNAB 240 de extrato do Itaú. Lançamentos já importados são ignorados." />
          </Form>
        </Card>
      </div>
    </>
  );
}
