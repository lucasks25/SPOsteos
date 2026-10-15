import Link from "next/link";
import { Form } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
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
      <PageHeader title="Aprovar contas a pagar" subtitle="Contas geradas pelo recebimento de compra ficam aguardando o financeiro. Só depois de aprovadas entram em remessa SISPAG. Confira o valor e o fornecedor com o pedido de compra." />
      {pendentes.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nada aguardando aprovação. Veja as <Link href="/financeiro/pagar" className="text-teal-700 hover:underline">contas a pagar</Link>.
          </p>
        </Card>
      ) : (
        <Form action={aprovarContasPagar} submitLabel="Aprovar selecionadas" resetOnSuccess>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendentes.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">
                      <input type="checkbox" name="id" value={t.id} className="h-4 w-4" aria-label={`Selecionar ${t.descricao}`} />
                    </td>
                    <td className="px-3 py-2">{date(t.vencimento)}</td>
                    <td className="max-w-xs truncate px-3 py-2">
                      <Link href={`/financeiro/pagar/${t.id}`} className="text-teal-700 hover:underline">
                        {t.descricao}
                      </Link>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2">{t.fornecedor ? t.fornecedor.nomeFantasia || t.fornecedor.razaoSocial : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(toNumber(t.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Form>
      )}
    </>
  );
}
