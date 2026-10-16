import { Badge, KpiGrid, LinkButton, PageHeader, Stat, Table, Td, type BadgeColor } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
import { Celula } from "@/components/lista";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mascarar, situacaoPagamento, type SituacaoPagamento } from "../_lib/favorecidos";
import { situacaoAprovacao } from "../_lib/favorecidos-aprovacao";
import { AbasNav } from "@/components/abas-nav";

const SITUACAO: Record<SituacaoPagamento, { texto: string; cor: BadgeColor }> = {
  COMPLETO: { texto: "Conta e Pix", cor: "green" },
  SO_CONTA: { texto: "Só conta", cor: "gray" },
  SO_PIX: { texto: "Só Pix", cor: "gray" },
  SEM_DADOS: { texto: "Sem dados (bloqueia SISPAG)", cor: "yellow" },
};

export default async function FavorecidosPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { q, situacao } = await searchParams;
  const todos = await db.fornecedor.findMany({
    where: {
      ativo: true,
      ...(q ? { OR: [{ razaoSocial: { contains: q, mode: "insensitive" } }, { nomeFantasia: { contains: q, mode: "insensitive" } }, { cnpj: { contains: q } }] } : {}),
    },
    orderBy: { razaoSocial: "asc" },
    take: 300,
    select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, bancoCodigo: true, agencia: true, conta: true, contaDigito: true, chavePix: true, pagamentoAprovadoHash: true },
  });
  const linhas = todos.map((f) => ({ ...f, sit: situacaoPagamento(f), pendente: situacaoPagamento(f) !== "SEM_DADOS" && situacaoAprovacao(f) === "PENDENTE" }));
  const pendentes = linhas.filter((l) => l.pendente).length;
  const semDados = linhas.filter((l) => l.sit === "SEM_DADOS").length;
  const lista = situacao === "sem" ? linhas.filter((l) => l.sit === "SEM_DADOS") : situacao === "aprovar" ? linhas.filter((l) => l.pendente) : linhas;
  return (
    <>
      <PageHeader title="Favorecidos" subtitle="Dados de pagamento dos fornecedores (banco, conta e chave Pix). Decidem para onde o SISPAG paga: toda alteração é auditada. Os dados cadastrais ficam em Cadastros." />
      <AbasNav atual="/financeiro/favorecidos" />
      <KpiGrid cols={3}>
        <Stat label="Fornecedores ativos" value={linhas.length} />
        <Stat href="/financeiro/favorecidos?situacao=sem" label="Sem dados de pagamento" value={semDados} tone={semDados ? "warn" : "default"} hint="bloqueiam o SISPAG" />
        <Stat href="/financeiro/favorecidos?situacao=aprovar" label="Aguardando aprovação" value={pendentes} tone={pendentes ? "warn" : "default"} hint="outra pessoa aprova" />
      </KpiGrid>
      <Filtros limparHref="/financeiro/favorecidos">
        <FiltroInput label="Fornecedor" name="q" defaultValue={q} placeholder="Razão social, fantasia ou CNPJ" className="w-72" />
        <FiltroSelect
          label="Situação"
          name="situacao"
          defaultValue={situacao}
          options={[
            { value: "sem", label: "Sem dados de pagamento" },
            { value: "aprovar", label: "Aguardando aprovação" },
          ]}
        />
      </Filtros>
      <Table titulo="Favorecidos" contagem={lista.length} head={["Fornecedor", { label: "CNPJ", hideOnMobile: true }, "Conta", { label: "Chave Pix", hideOnMobile: true }, "Situação"]} empty={lista.length === 0} emptyText="Nenhum fornecedor encontrado." emptyAction={<LinkButton href="/financeiro/favorecidos" variant="secondary">Limpar filtros</LinkButton>}>
        {lista.map((f) => (
          <tr key={f.id}>
            <Td className="max-w-xs">
              <Celula href={`/financeiro/favorecidos/${f.id}`} principal={f.nomeFantasia || f.razaoSocial} sub={f.nomeFantasia ? f.razaoSocial : undefined} />
            </Td>
            <Td className="font-mono text-xs">{f.cnpj}</Td>
            <Td className="font-mono text-xs">{f.bancoCodigo ? `${f.bancoCodigo} · ag ${f.agencia ?? "—"} · cc ${mascarar(f.conta)}` : "—"}</Td>
            <Td className="font-mono text-xs">{f.chavePix ? mascarar(f.chavePix) : "—"}</Td>
            <Td><span className="inline-flex flex-wrap gap-1.5"><Badge color={SITUACAO[f.sit].cor}>{SITUACAO[f.sit].texto}</Badge>{f.pendente && <Badge color="yellow">Aguardando aprovação</Badge>}</span></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
