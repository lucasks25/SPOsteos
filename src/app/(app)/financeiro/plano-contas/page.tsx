import { ActionButton, Field, Form, Grid, Select } from "@/components/form";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
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
      {uso > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{uso} título(s) ainda sem conta do plano. Use <a href="/financeiro/classificar" className="underline">Classificar pendentes</a>.</p>}
      <div className="space-y-6">
        <Table head={["Código", "Conta", "Tipo", "Natureza", "Situação", ""]}>
          {ordenadas.map((c) => (
            <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
              <Td className="tabular-nums">{c.codigo}</Td>
              <Td className={c.analitica ? "" : "font-semibold"}>
                <span style={{ paddingLeft: `${nivel(c.codigo) * 1.25}rem` }}>{c.nome}</span>
                {c.chaveSistema && <span className="ml-2 text-xs text-slate-400">(sistema)</span>}
              </Td>
              <Td>{rotuloTipo(c.tipo)}</Td>
              <Td>{c.analitica ? "Conta" : "Grupo"}</Td>
              <Td>
                <Badge color={c.ativo ? "green" : "gray"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
              </Td>
              <Td>
                <ActionButton action={alternarContaPlano} hidden={{ id: c.id }} variant="secondary">
                  {c.ativo ? "Inativar" : "Reativar"}
                </ActionButton>
              </Td>
            </tr>
          ))}
        </Table>

        <Card title="Nova conta ou grupo">
          <Form action={criarContaPlano} submitLabel="Criar" resetOnSuccess>
            <Grid cols={4}>
              <Field label="Código *" name="codigo" required hint="Ex.: 4.08 dentro do grupo 4" />
              <Field label="Nome *" name="nome" required maxLength={80} className="sm:col-span-2" />
              <Select label="Dentro do grupo" name="paiId" options={grupos.map((g) => ({ value: g.id, label: `${g.codigo} — ${g.nome}` }))} placeholder="(raiz)" />
              <Select label="Tipo *" name="tipo" options={TIPOS_PLANO} placeholder="Selecione..." required hint="Dentro de um grupo, o mesmo tipo dele" />
              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                <input type="checkbox" name="analitica" defaultChecked /> Conta analítica (recebe lançamentos)
              </label>
            </Grid>
          </Form>
        </Card>

        <Card title="Centros de custo">
          <Table head={["Código", "Nome", "Situação", ""]} empty={centros.length === 0}>
            {centros.map((c) => (
              <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                <Td>{c.codigo}</Td>
                <Td>{c.nome}</Td>
                <Td>
                  <Badge color={c.ativo ? "green" : "gray"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                </Td>
                <Td>
                  <ActionButton action={alternarCentroCusto} hidden={{ id: c.id }} variant="secondary">
                    {c.ativo ? "Inativar" : "Reativar"}
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4">
            <Form action={criarCentroCusto} submitLabel="Criar centro de custo" resetOnSuccess>
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
