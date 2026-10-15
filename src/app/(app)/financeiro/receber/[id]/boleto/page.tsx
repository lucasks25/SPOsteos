import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { barrasITF } from "../../../_lib/barras";
import { codigoBarras44, linhaDigitavel, nossoNumeroComDac } from "../../../_lib/cobranca";
import { contaEDac } from "../../../_lib/sispag-regras";

/** Boleto imprimível (carteira 109: o Itaú registra, você imprime). Só depois da confirmação de registro pelo banco. */
export default async function BoletoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  const t = await db.contaReceber.findUnique({ where: { id }, include: { hospital: true } });
  if (!t) notFound();
  const conta = t.cobrancaContaId ? await db.contaBancaria.findUnique({ where: { id: t.cobrancaContaId } }) : null;
  const cd = contaEDac(conta?.numero);
  const voltar = <Link href={`/financeiro/receber/${id}`} className="text-sm text-teal-700 hover:underline">← voltar ao título</Link>;

  if (!conta || !cd || !t.nossoNumero || t.cobrancaStatus !== "REGISTRADO" || t.status !== "ABERTO") {
    return (
      <>
        <PageHeader title="Boleto" subtitle="O boleto ainda não pode ser impresso." />
        <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O boleto só pode ser impresso com o título em aberto e o registro confirmado pelo banco (importe o retorno em Cobrança). Situação da cobrança: {t.cobrancaStatus ? t.cobrancaStatus.toLowerCase() : "sem cobrança"}.
        </p>
        {voltar}
      </>
    );
  }

  const ben = { agencia: (conta.agencia ?? "").replace(/\D/g, "").padStart(4, "0"), conta: cd.conta.replace(/^0+/, "").padStart(5, "0"), dac: cd.dac, carteira: "109" as const };
  const valor = toNumber(t.valor) - toNumber(t.valorBaixado);
  const barras = codigoBarras44(ben, { nossoNumero: t.nossoNumero, vencimento: t.vencimento, valorCentavos: Math.round(valor * 100) });
  const itf = barrasITF(barras);
  const h = t.hospital;

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Boleto de cobrança" subtitle="Confira os dados e imprima. Pagável em qualquer banco até o vencimento." actions={<PrintButton />} />
        {voltar}
      </div>
      <div className="mx-auto mt-4 max-w-3xl border border-slate-400 bg-white p-4 text-sm text-slate-900">
        <div className="flex items-end justify-between border-b border-slate-400 pb-2">
          <div className="text-lg font-bold">Itaú | 341-7</div>
          <div className="font-mono text-sm">{linhaDigitavel(barras)}</div>
        </div>
        <div className="grid grid-cols-3 gap-0 border-b border-slate-400 text-xs">
          <div className="col-span-2 border-r border-slate-400 p-1"><div className="text-slate-500">Beneficiário</div>{conta.titularNome} — CNPJ {conta.titularCnpj}</div>
          <div className="p-1"><div className="text-slate-500">Agência / Código do beneficiário</div>{ben.agencia} / {ben.conta}-{ben.dac}</div>
        </div>
        <div className="grid grid-cols-4 gap-0 border-b border-slate-400 text-xs">
          <div className="border-r border-slate-400 p-1"><div className="text-slate-500">Nosso número</div>{nossoNumeroComDac(ben, t.nossoNumero)}</div>
          <div className="border-r border-slate-400 p-1"><div className="text-slate-500">Nº do documento</div>{t.pedidoId ? `PV${t.pedidoId}` : t.nossoNumero}</div>
          <div className="border-r border-slate-400 p-1"><div className="text-slate-500">Vencimento</div><strong>{date(t.vencimento)}</strong></div>
          <div className="p-1"><div className="text-slate-500">Valor do documento</div><strong>{money(valor)}</strong></div>
        </div>
        <div className="border-b border-slate-400 p-1 text-xs">
          <div className="text-slate-500">Instruções</div>
          Após o vencimento, cobrar multa de {toNumber(conta.cobrancaMultaPercent)}% e juros de {toNumber(conta.cobrancaJurosMensalPercent)}% ao mês.
        </div>
        <div className="border-b border-slate-400 p-1 text-xs">
          <div className="text-slate-500">Pagador</div>
          {h ? `${h.razaoSocial} — CNPJ ${h.cnpj}` : "—"}
          {h && <div>{[h.endereco, h.bairro, h.cep, h.cidade && `${h.cidade}/${h.uf ?? ""}`].filter(Boolean).join(" — ")}</div>}
        </div>
        <svg className="mt-3" viewBox={`0 0 ${itf.largura} 1`} preserveAspectRatio="none" style={{ width: "100%", maxWidth: 440, height: 56 }} role="img" aria-label={`Código de barras ${barras}`}>
          {itf.barras.map((b, i) => (
            <rect key={i} x={b.x} y={0} width={b.w} height={1} fill="#000" />
          ))}
        </svg>
        <div className="mt-1 text-xs text-slate-500">Pagável em qualquer banco até o vencimento. Linha digitável: {linhaDigitavel(barras)}</div>
      </div>
    </>
  );
}
