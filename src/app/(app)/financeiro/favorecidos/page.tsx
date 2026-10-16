import Link from "next/link";
import { Badge, KpiGrid, LinkButton, PageHeader, SearchBar, Stat, Table, Td, btn, campo, type BadgeColor } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mascarar, situacaoPagamento, type SituacaoPagamento } from "../_lib/favorecidos";
import { situacaoAprovacao } from "../_lib/favorecidos-aprovacao";

const SITUACAO: Record<SituacaoPagamento, { texto: string; cor: BadgeColor }> = {
  COMPLETO: { texto: "conta e Pix", cor: "green" },
  SO_CONTA: { texto: "só conta", cor: "gray" },
  SO_PIX: { texto: "só Pix", cor: "gray" },
  SEM_DADOS: { texto: "sem dados (bloqueia SISPAG)", cor: "yellow" },
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
      <KpiGrid cols={3}>
        <Stat label="Fornecedores ativos" value={linhas.length} />
        <Stat label="Sem dados de pagamento" value={semDados} tone={semDados ? "warn" : "default"} hint="bloqueiam o SISPAG" />
        <Stat label="Aguardando aprovação" value={pendentes} tone={pendentes ? "warn" : "default"} hint="dados alterados: outra pessoa aprova" />
      </KpiGrid>
      <SearchBar placeholder="Razão social, fantasia ou CNPJ" defaultValue={q}>
        <select name="situacao" defaultValue={situacao ?? ""} className={`${campo} w-auto min-w-60`} aria-label="Situação">
          <option value="">Todos</option>
          <option value="sem">Sem dados de pagamento</option>
          <option value="aprovar">Aguardando aprovação</option>
        </select>
      </SearchBar>
      <Table titulo="Favorecidos" contagem={lista.length} head={["Fornecedor", "CNPJ", "Conta", "Chave Pix", "Situação", ""]} empty={lista.length === 0} emptyText="Nenhum fornecedor encontrado." emptyAction={<LinkButton href="/financeiro/favorecidos" variant="secondary">Limpar filtros</LinkButton>}>
        {lista.map((f) => (
          <tr key={f.id}>
            <Td>
              <div className="font-medium text-teal-700">{f.nomeFantasia || f.razaoSocial}</div>
              {f.nomeFantasia && <div className="text-xs text-slate-500">{f.razaoSocial}</div>}
            </Td>
            <Td className="font-mono text-xs">{f.cnpj}</Td>
            <Td className="font-mono text-xs">{f.bancoCodigo ? `${f.bancoCodigo} · ag ${f.agencia ?? "—"} · cc ${mascarar(f.conta)}` : "—"}</Td>
            <Td className="font-mono text-xs">{f.chavePix ? mascarar(f.chavePix) : "—"}</Td>
            <Td><span className="inline-flex flex-wrap gap-1.5"><Badge color={SITUACAO[f.sit].cor}>{SITUACAO[f.sit].texto}</Badge>{f.pendente && <Badge color="yellow">aguardando aprovação</Badge>}</span></Td>
            <Td className="text-right"><Link href={`/financeiro/favorecidos/${f.id}`} className={btn.small}>Editar</Link></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
