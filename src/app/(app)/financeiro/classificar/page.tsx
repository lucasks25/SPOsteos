import { Form, Grid, Select } from "@/components/form";
import { LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { classificarLote } from "../_lib/classificar-actions";
import { opcoesClassificacao } from "../_lib/plano";

type Linha = { chave: string; tipo: string; data: Date; descricao: string; parceiro: string; valor: number };
const nome = (p: { razaoSocial: string; nomeFantasia: string | null } | null) => (p ? p.nomeFantasia || p.razaoSocial : "—");

export default async function ClassificarPage() {
  await requireUser(["FINANCEIRO"]);
  const [cr, cp, av, { planos, centros }] = await Promise.all([
    db.contaReceber.findMany({ where: { planoContaId: null, status: { not: "CANCELADO" } }, orderBy: { competencia: "asc" }, take: 300, include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.contaPagar.findMany({ where: { planoContaId: null, status: { not: "CANCELADO" } }, orderBy: { competencia: "asc" }, take: 300, include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }),
    db.lancamento.findMany({ where: { planoContaId: null, contaReceberId: null, contaPagarId: null, transferenciaId: null }, orderBy: { data: "asc" }, take: 300, include: { conta: { select: { nome: true } } } }),
    opcoesClassificacao(db),
  ]);
  const linhas: Linha[] = [
    ...cr.map((t) => ({ chave: `receber:${t.id}`, tipo: "A receber", data: t.competencia, descricao: t.descricao, parceiro: nome(t.hospital), valor: toNumber(t.valor) })),
    ...cp.map((t) => ({ chave: `pagar:${t.id}`, tipo: "A pagar", data: t.competencia, descricao: t.descricao, parceiro: nome(t.fornecedor), valor: -toNumber(t.valor) })),
    ...av.map((l) => ({ chave: `avulso:${l.id}`, tipo: "Avulso", data: l.data, descricao: l.descricao, parceiro: l.conta.nome, valor: l.sentido === "ENTRADA" ? toNumber(l.valor) : -toNumber(l.valor) })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  return (
    <>
      <PageHeader title="Classificar pendentes" subtitle="Títulos e lançamentos avulsos sem conta do plano. Marque os itens, escolha a conta e aplique de uma vez; a competência não muda." />
      {linhas.length === 0 ? (
        <Table head={["Competência", "Tipo", "Descrição", "Parceiro / conta", "Valor"]} empty emptyText="Nada pendente: tudo está classificado." emptyAction={<LinkButton href="/financeiro/dre" variant="secondary">Ver o DRE</LinkButton>}>
          {null}
        </Table>
      ) : (
        <Form action={classificarLote} submitLabel="Classificar selecionados" resetOnSuccess>
          <Grid cols={2}>
            <Select label="Conta do plano *" name="planoContaId" options={planos} placeholder="Selecione..." required />
            <Select label="Centro de custo (opcional)" name="centroCustoId" options={centros} placeholder="(manter como está)" />
          </Grid>
          <Table titulo="Itens sem classificação" contagem={linhas.length} head={[<span key="s" className="sr-only">Selecionar</span>, "Competência", "Tipo", "Descrição", "Parceiro / conta", "Valor"]}>
            {linhas.map((l) => (
              <tr key={l.chave}>
                <Td>
                  <input type="checkbox" name="item" value={l.chave} className="h-4 w-4" aria-label={`Selecionar ${l.descricao}`} />
                </Td>
                <Td>{date(l.data)}</Td>
                <Td>{l.tipo === "Avulso" ? "Lançamento avulso" : l.tipo}</Td>
                <Td className="max-w-xs truncate">{l.descricao}</Td>
                <Td className="max-w-[14rem] truncate">{l.parceiro}</Td>
                <Td className={`text-right tnum ${l.valor < 0 ? "text-rose-600" : ""}`}>{money(l.valor)}</Td>
              </tr>
            ))}
          </Table>
          <p className="text-xs text-slate-500">Mostrando até 300 de cada tipo, do mais antigo. Item em mês fechado faz o lote inteiro ser recusado: reabra o mês em Fechamento.</p>
        </Form>
      )}
    </>
  );
}
