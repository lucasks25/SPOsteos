import Link from "next/link";
import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { Aviso, Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { alternarCentroCusto, alternarContaPlano, criarCentroCusto, criarContaPlano } from "../_lib/plano-actions";
import { TIPOS_PLANO, rotuloTipo } from "../_lib/plano-regras";

export default async function PlanoContasPage() {
  await requireUser(["FINANCEIRO"]);
  const [contas, centros, uso] = await Promise.all([
    db.planoConta.findMany({ orderBy: { codigo: "asc" } }),
    db.centroCusto.findMany({ orderBy: { codigo: "asc" } }),
    db.contaPagar.count({ where: { planoContaId: null, status: { not: "CANCELADO" } } }).then(async (p) => p + (await db.contaReceber.count({ where: { planoContaId: null, status: { not: "CANCELADO" } } }))),
  ]);
  // ordena pela árvore: código "4.10" depois de "4.9" não é problema porque a lista segue a ordem numérica por segmento
  const ordenadas = [...contas].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  const grupos = contas.filter((c) => !c.analitica && c.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  const nivel = (cod: string) => cod.split(".").length - 1;

  return (
    <>
      <PageHeader title="Plano de contas e centros de custo" subtitle="Classificação usada pelo DRE gerencial. Só contas analíticas recebem títulos e lançamentos." />
      {uso > 0 && <Aviso tom="alerta" className="mb-3">{uso} título(s) ainda sem conta do plano. Use <Link href="/financeiro/classificar" className="font-semibold underline">Classificar pendentes</Link>.</Aviso>}
      <div className="space-y-4">
        <Table titulo="Plano de contas" icone="livro" contagem={ordenadas.length} head={["Código", "Conta", "Tipo", "Natureza", "Situação", ""]} empty={ordenadas.length === 0} emptyText="Nenhuma conta no plano. Crie a primeira abaixo.">
          {ordenadas.map((c) => (
            <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
              <Td>{c.codigo}</Td>
              <Td className={c.analitica ? "" : "font-semibold"}>
                <span style={{ paddingLeft: `${nivel(c.codigo) * 1.25}rem` }}>{c.nome}</span>
                {c.chaveSistema && <span className="ml-2 text-xs text-slate-500">(sistema)</span>}
              </Td>
              <Td>{rotuloTipo(c.tipo)}</Td>
              <Td>{c.analitica ? "Conta" : "Grupo"}</Td>
              <Td>
                <Badge color={c.ativo ? "green" : "gray"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
              </Td>
              <Td>
                <ActionButton action={alternarContaPlano} hidden={{ id: c.id }} variant="small" confirm={c.ativo ? `Inativar a conta ${c.codigo} ${c.nome}? Ela deixa de aceitar novos títulos e lançamentos; o histórico e o DRE passados são mantidos.` : undefined}>
                  {c.ativo ? "Inativar" : "Reativar"}
                </ActionButton>
              </Td>
            </tr>
          ))}
        </Table>

        <Card title="Nova conta ou grupo" icon="mais">
          <Form action={criarContaPlano} submitLabel="Criar" resetOnSuccess>
            <Grid cols={4}>
              <Field label="Código *" name="codigo" required hint="Ex.: 4.08 dentro do grupo 4" />
              <Field label="Nome *" name="nome" required maxLength={80} className="sm:col-span-2" />
              <Select label="Dentro do grupo" name="paiId" options={grupos.map((g) => ({ value: g.id, label: `${g.codigo} — ${g.nome}` }))} placeholder="(raiz)" />
              <Select label="Tipo *" name="tipo" options={TIPOS_PLANO} placeholder="Selecione..." required hint="Dentro de um grupo, o mesmo tipo dele" />
              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                <input type="checkbox" name="analitica" defaultChecked className="h-4 w-4" /> Conta analítica (recebe lançamentos)
              </label>
            </Grid>
          </Form>
        </Card>

        <Table titulo="Centros de custo" icone="camadas" contagem={centros.length} head={["Código", "Nome", "Situação", ""]} empty={centros.length === 0} emptyText="Nenhum centro de custo cadastrado. Crie o primeiro abaixo.">
            {centros.map((c) => (
              <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                <Td>{c.codigo}</Td>
                <Td>{c.nome}</Td>
                <Td>
                  <Badge color={c.ativo ? "green" : "gray"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                </Td>
                <Td>
                  <ActionButton action={alternarCentroCusto} hidden={{ id: c.id }} variant="small" confirm={c.ativo ? `Inativar o centro de custo ${c.codigo} ${c.nome}? Ele deixa de aceitar novos títulos e lançamentos; o histórico é mantido.` : undefined}>
                    {c.ativo ? "Inativar" : "Reativar"}
                  </ActionButton>
                </Td>
              </tr>
            ))}
        </Table>
        <Card title="Novo centro de custo" icon="mais">
          <div>
            <Form action={criarCentroCusto} submitLabel="Criar centro de custo" submitVariant="secondary" resetOnSuccess>
              <Grid cols={3}>
                <Field label="Código *" name="codigo" required hint="Ex.: COL (coluna), TRA (trauma)" />
                <Field label="Nome *" name="nome" required maxLength={80} className="sm:col-span-2" />
              </Grid>
            </Form>
          </div>
        </Card>
      </div>
    </>
  );
}
