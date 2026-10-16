import { ActionButton, Field, Form, Select } from "@/components/form";
import { Card, Dica, EmptyState, FilterBar, KpiGrid, LinkButton, PageHeader, Stat, Table, Td, btn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, num } from "@/lib/format";
import { carregarConciliacao } from "../_lib/conciliacao";
import { opcoesClassificacao } from "../_lib/plano";
import { desfazerConciliacao, importarExtrato } from "../_lib/conciliacao-actions";
import { ItemExtrato, LinhaPendente } from "./linha";
import { AbasNav } from "@/components/abas-nav";

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["FINANCEIRO"]);
  const sp = await searchParams;
  const contas = await db.contaBancaria.findMany({ where: { ativo: true, tipo: "BANCO" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  const escolhida = typeof sp.conta === "string" ? contas.find((c) => c.id === sp.conta) : contas[0];

  if (!escolhida) {
    return (
      <>
        <PageHeader title="Conciliação bancária" subtitle="Compare o extrato do banco com o que foi baixado no sistema." />
        <AbasNav atual="/financeiro/conciliacao" />
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
  const aberta = d.pendentes.find((p) => p.linha.id === sp.linha) ?? d.pendentes[0];
  const hrefLinha = (id: string) => `/financeiro/conciliacao?conta=${escolhida.id}&linha=${id}`;
  const { planos, centros } = await opcoesClassificacao(db);
  return (
    <>
      <PageHeader title="Conciliação bancária" subtitle="Importe o extrato do banco (OFX ou CNAB 240) e case cada linha com uma baixa, um título ou um lançamento avulso." actions={<a href="#importar" className={btn.secondary}>Importar extrato</a>} />
      <AbasNav atual="/financeiro/conciliacao" />

      <FilterBar>
        <Select label="Conta bancária" name="conta" defaultValue={escolhida.id} options={contas.map((c) => ({ value: c.id, label: c.nome }))} placeholder="" className="w-64" />
        <button className={btn.secondary}>Abrir</button>
      </FilterBar>

      <KpiGrid cols={3}>
        <Stat label="Para conciliar" value={num(d.pendTotal)} tone={d.pendTotal > 0 ? "warn" : "default"} hint="linhas sem vínculo" />
        <Stat label="Conciliadas" value={num(d.concTotal)} />
        <Stat label="Lançamentos sem extrato" value={num(d.semExtrato)} hint="baixas ainda não vistas no banco" />
      </KpiGrid>

      <div className="space-y-4">
        {/* Odoo, conciliação bancária: extrato à esquerda, o que fazer com a linha aberta à direita */}
        <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Card title="Extrato pendente" semRecuo actions={<span className="tnum text-sm text-slate-500">{d.pendTotal}{d.pendTotal > 100 && " (100 mais antigas)"}</span>}>
            {d.pendentes.length === 0 ? (
              <div className="px-4 py-8">
                <EmptyState icon="ok" text="Nada pendente nesta conta. Importe um novo extrato quando tiver." />
              </div>
            ) : (
              <nav aria-label="Linhas do extrato" className="max-h-80 overflow-y-auto xl:max-h-[calc(100dvh-16rem)]">
                {d.pendentes.map((p) => (
                  <ItemExtrato key={p.linha.id} linha={p.linha} href={hrefLinha(p.linha.id)} ativo={p.linha.id === aberta?.linha.id} sugestao={p.sugLanc.length > 0 || p.exatos.length > 0} />
                ))}
              </nav>
            )}
          </Card>
          {aberta ? (
            <LinhaPendente key={aberta.linha.id} linha={aberta.linha} sugLanc={aberta.sugLanc} exatos={aberta.exatos} titulos={aberta.titulos} planos={planos} centros={centros} />
          ) : (
            <Card>
              <div className="py-8">
                <EmptyState icon="conciliar" text="Sem linha para conciliar. Importe o extrato do banco para começar." />
              </div>
            </Card>
          )}
        </div>

        <Table
          titulo="Últimas conciliadas"
          contagem={d.conciliadas.length}
          head={["Data", "Extrato", "Valor", { label: "Lançamento vinculado", hideOnMobile: true }, ""]}
          empty={d.conciliadas.length === 0}
          emptyText="Nenhuma linha conciliada ainda nesta conta."
        >
          {d.conciliadas.map((l) => (
            <tr key={l.id}>
              <Td>{date(l.data)}</Td>
              <Td className="max-w-xs truncate">{l.descricao}</Td>
              <Td className={`text-right tnum font-medium ${l.valor > 0 ? "text-emerald-700" : "text-rose-600"}`}>{money(l.valor)}</Td>
              <Td className="max-w-xs truncate">
                <span className="text-slate-600">{l.vinculo}</span>
              </Td>
              <Td className="text-right">
                <ActionButton action={desfazerConciliacao.bind(null, l.id)} variant="small" confirm="Desfazer esta conciliação?">
                  Desfazer
                </ActionButton>
              </Td>
            </tr>
          ))}
        </Table>

        <Card id="importar" className="scroll-mt-20" title="Importar extrato (OFX ou CNAB 240 Itaú)" actions={<Dica alinhar="direita">OFX do internet banking ou arquivo de retorno CNAB 240 de extrato do Itaú. Lançamentos já importados são ignorados.</Dica>}>
          <Form action={importarExtrato} submitLabel="Importar" submitVariant="secondary" resetOnSuccess>
            <input type="hidden" name="contaId" value={escolhida.id} />
            <Field label={`Arquivo do extrato da conta ${escolhida.nome}`} name="arquivo" type="file" accept=".ofx,.OFX,.ret,.RET,.txt,.TXT,.cnab,.CNAB" required className="max-w-md" />
          </Form>
        </Card>
      </div>
    </>
  );
}
