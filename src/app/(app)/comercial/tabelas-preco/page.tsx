import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { date, num } from "@/lib/format";
import { tabelaVigente } from "../_lib/precos";

export default async function TabelasPage() {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const tabelas = await db.tabelaPreco.findMany({ include: { _count: { select: { itens: true, hospitais: true } } }, orderBy: { nome: "asc" } });
  return (
    <>
      <PageHeader title="Tabelas de preço" subtitle="Preço de venda por hospital. Sem item na tabela, vale o preço base do produto." actions={<LinkButton href="/comercial/tabelas-preco/nova">Nova tabela</LinkButton>} />
      <Table head={["Nome", "Vigência", "Situação", "Produtos", "Hospitais", ""]} empty={tabelas.length === 0}>
        {tabelas.map((t) => (
          <tr key={t.id} className="hover:bg-slate-50">
            <Td className="font-medium">{t.nome}</Td>
            <Td>{t.vigenciaInicio || t.vigenciaFim ? `${date(t.vigenciaInicio)} a ${date(t.vigenciaFim)}` : "sem prazo"}</Td>
            <Td>{tabelaVigente(t) ? <Badge color="green">vigente</Badge> : <Badge>fora de vigência</Badge>}</Td>
            <Td>{num(t._count.itens)}</Td>
            <Td>{num(t._count.hospitais)}</Td>
            <Td><Link href={`/comercial/tabelas-preco/${t.id}`} className="text-teal-700 hover:underline">Abrir</Link></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
