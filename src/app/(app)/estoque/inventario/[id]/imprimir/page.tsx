import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { date, dateTime } from "@/lib/format";
import { PERFIS_VER } from "../../../_lib/perfis";
import { docInventario } from "../../../_lib/inventario-servico";

/** Folha de contagem: preto e branco, sem o saldo do sistema (contagem cega), com campos em branco. */
export default async function FolhaContagemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(PERFIS_VER);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const inv = await db.inventarioConsignacao.findUnique({
    where: { id },
    include: {
      hospital: true,
      itens: { include: { produto: { select: { codigo: true, descricao: true, gtin: true } }, lote: { select: { numero: true, validade: true } } }, orderBy: [{ produto: { descricao: "asc" } }, { lote: { numero: "asc" } }] },
    },
  });
  if (!inv) notFound();
  const th = "border border-black px-2 py-1 text-left text-xs font-bold";
  const td = "border border-black px-2 py-2 align-middle";
  return (
    <div className="mx-auto max-w-4xl bg-white p-4 text-black print:max-w-none print:p-0">
      <div className="mb-3 print:hidden">
        <PrintButton label="Imprimir folha" />
      </div>
      <h1 className="text-xl font-bold">Folha de contagem de consignado — {docInventario(inv.id)}</h1>
      <p className="mt-1 text-sm">
        Hospital: <strong>{inv.hospital.razaoSocial}</strong> (CNPJ {inv.hospital.cnpj}) · Emitida em {dateTime(new Date())}
      </p>
      <p className="mb-3 text-sm">Conte o que está fisicamente no hospital e anote a quantidade. Se não encontrar, escreva 0.</p>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>Código</th>
            <th className={th}>Descrição</th>
            <th className={th}>Lote</th>
            <th className={th}>Validade</th>
            <th className={`${th} w-28`}>Contado</th>
            <th className={`${th} w-40`}>Obs.</th>
          </tr>
        </thead>
        <tbody>
          {inv.itens.map((i) => (
            <tr key={i.id} className="break-inside-avoid">
              <td className={`${td} font-mono text-xs`}>{i.produto.codigo}</td>
              <td className={td}>{i.produto.descricao}</td>
              <td className={`${td} font-mono text-xs`}>{i.lote.numero}</td>
              <td className={td}>{date(i.lote.validade)}</td>
              <td className={td}></td>
              <td className={td}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-5 text-sm font-bold">Material encontrado que não consta na lista</h2>
      <table className="mt-1 w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>Código / descrição</th>
            <th className={`${th} w-40`}>Lote</th>
            <th className={`${th} w-28`}>Validade</th>
            <th className={`${th} w-28`}>Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, k) => (
            <tr key={k} className="break-inside-avoid">
              <td className={`${td} h-9`}></td>
              <td className={td}></td>
              <td className={td}></td>
              <td className={td}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
        <div className="border-t border-black pt-1">Contado por (nome e data)</div>
        <div className="border-t border-black pt-1">Responsável do hospital (nome, carimbo e assinatura)</div>
      </div>
    </div>
  );
}
