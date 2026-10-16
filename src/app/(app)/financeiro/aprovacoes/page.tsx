import Link from "next/link";
import { Form } from "@/components/form";
import { LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { aprovarContasPagar } from "../_lib/aprovacao-actions";

export default async function AprovacoesPage() {
  await requireUser(["FINANCEIRO"]);
  const pendentes = await db.contaPagar.findMany({
    where: { aprovadoEm: null, status: "ABERTO" },
    orderBy: { vencimento: "asc" },
    take: 300,
    include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, pedido: { select: { id: true } } },
  });
  return (
    <>
      <PageHeader title="Aprovar contas a pagar" subtitle="Contas geradas pelo recebimento de compra esperam a aprovação do financeiro e só então entram em remessa de pagamento. Confira valor e fornecedor com o pedido." />
      {pendentes.length === 0 ? (
        <Table head={["Vencimento", "Descrição", "Fornecedor", "Valor"]} empty emptyText="Nada aguardando aprovação. Contas lançadas à mão pelo financeiro já nascem aprovadas; aqui ficam as geradas pelo recebimento de compras." emptyAction={<LinkButton href="/financeiro/pagar" variant="secondary">Ver contas a pagar</LinkButton>}>
          {null}
        </Table>
      ) : (
        <Form action={aprovarContasPagar} submitLabel="Aprovar selecionadas" resetOnSuccess>
          <Table head={[<span key="s" className="sr-only">Selecionar</span>, "Vencimento", "Descrição", "Fornecedor", "Valor"]}>
            {pendentes.map((t) => (
              <tr key={t.id}>
                <Td>
                  <input type="checkbox" name="id" value={t.id} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                </Td>
                <Td>{date(t.vencimento)}</Td>
                <Td className="max-w-xs truncate">
                  <Link href={`/financeiro/pagar/${t.id}`} className="text-teal-700 hover:underline">
                    {t.descricao}
                  </Link>
                </Td>
                <Td className="max-w-[14rem] truncate">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "—"}</Td>
                <Td className="text-right tnum">{money(toNumber(t.valor))}</Td>
              </tr>
            ))}
          </Table>
        </Form>
      )}
    </>
  );
}
