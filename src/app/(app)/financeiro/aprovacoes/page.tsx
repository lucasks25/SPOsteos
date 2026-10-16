import Link from "next/link";
import { Form } from "@/components/form";
import { LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { aprovarContasPagar } from "../_lib/aprovacao-actions";
import { autoresConta, podeAprovarPropria, rotulosAutoria } from "../_lib/aprovacao-servico";

export default async function AprovacoesPage() {
  const user = await requireUser(["FINANCEIRO"]);
  const pendentes = await db.contaPagar.findMany({
    where: { aprovadoEm: null, status: "ABERTO" },
    orderBy: { vencimento: "asc" },
    take: 300,
    include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, pedido: { select: { id: true } } },
  });
  const [autoria, aprovaPropria] = await Promise.all([rotulosAutoria(db, pendentes), podeAprovarPropria(db, user.id)]);
  return (
    <>
      <PageHeader title="Aprovar contas a pagar" subtitle="Toda conta a pagar (lançada à mão ou gerada por compras) e toda conta que teve valor, vencimento, fornecedor ou boleto alterado espera a aprovação de outra pessoa do financeiro antes de entrar em remessa de pagamento. Quem criou ou alterou a conta não a aprova." />
      {pendentes.length === 0 ? (
        <Table head={["Vencimento", "Descrição", "Fornecedor", "Valor"]} empty emptyText="Nada aguardando aprovação. Aqui ficam as contas novas e as que tiveram dados de pagamento alterados." emptyAction={<LinkButton href="/financeiro/pagar" variant="secondary">Ver contas a pagar</LinkButton>}>
          {null}
        </Table>
      ) : (
        <Form action={aprovarContasPagar} submitLabel="Aprovar selecionadas" resetOnSuccess>
          <Table head={[<span key="s" className="sr-only">Selecionar</span>, "Vencimento", "Descrição", "Fornecedor", "Valor", "Criada/alterada por"]}>
            {pendentes.map((t) => {
              const propria = autoresConta(t).includes(user.id) && !aprovaPropria;
              return (
              <tr key={t.id}>
                <Td>
                  <input type="checkbox" name="id" value={t.id} disabled={propria} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} title={propria ? "Você criou ou alterou esta conta: outra pessoa do financeiro aprova." : undefined} />
                </Td>
                <Td>{date(t.vencimento)}</Td>
                <Td className="max-w-xs truncate">
                  <Link href={`/financeiro/pagar/${t.id}`} className="text-teal-700 hover:underline">
                    {t.descricao}
                  </Link>
                </Td>
                <Td className="max-w-[14rem] truncate">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "—"}</Td>
                <Td className="text-right tnum">{money(toNumber(t.valor))}</Td>
                <Td className="text-xs text-slate-600">
                  {autoria.get(t.id)}
                  {propria && <span className="block font-medium text-amber-700">você não pode aprovar</span>}
                </Td>
              </tr>
              );
            })}
          </Table>
        </Form>
      )}
    </>
  );
}
