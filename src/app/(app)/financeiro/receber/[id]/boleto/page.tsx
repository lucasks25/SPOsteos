import { CabecalhoImpresso } from "@/components/marca";
import { notFound } from "next/navigation";
import { Aviso, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money, toNumber } from "@/lib/format";
import { barrasITF } from "../../../_lib/barras";
import { codigoBarras44, linhaDigitavel, nossoNumeroComDac } from "../../../_lib/cobranca";
import { emissaoDocumento, jurosDiaCentavos } from "../../../_lib/cobranca-servico";
import { ESPECIES } from "../../../_lib/cobranca-tabelas";
import { diaBrasilia } from "@/lib/datas";
import { empresa } from "@/lib/empresa";
import { contaEDac } from "../../../_lib/sispag-regras";

/**
 * Boleto imprimível (carteira 109: o Itaú registra, você imprime). Só depois da confirmação de registro pelo banco.
 * Campos do anexo 1 do manual de cobrança CNAB 400 (jan/2017). O código de barras leva o valor e o vencimento
 * REGISTRADOS (entrada 01), não o saldo atual: boleto registrado com outro valor seria recusado/divergente.
 * Antes de usar em produção, o modelo precisa ser aprovado pela célula de boletos do Itaú (exigência do manual).
 */
export default async function BoletoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["FINANCEIRO"]);
  const { id } = await params;
  const t = await db.contaReceber.findUnique({ where: { id }, include: { hospital: true } });
  if (!t) notFound();
  const conta = t.cobrancaContaId ? await db.contaBancaria.findUnique({ where: { id: t.cobrancaContaId } }) : null;
  const cd = contaEDac(conta?.numero);
  const voltar = { href: `/financeiro/receber/${id}`, label: "Título" };

  if (!conta || !cd || !t.nossoNumero || t.cobrancaStatus !== "REGISTRADO" || t.status !== "ABERTO") {
    return (
      <>
        <PageHeader voltar={voltar} title="Boleto" subtitle="O boleto ainda não pode ser impresso." />
        <Aviso tom="alerta" className="mb-3">
          O boleto só pode ser impresso com o título em aberto e o registro confirmado pelo banco (importe o retorno em Cobrança). Situação da cobrança: {t.cobrancaStatus ? t.cobrancaStatus.toLowerCase() : "sem cobrança"}.
        </Aviso>
      </>
    );
  }

  const ben = { agencia: (conta.agencia ?? "").replace(/\D/g, "").padStart(4, "0"), conta: cd.conta.replace(/^0+/, "").padStart(5, "0"), dac: cd.dac, carteira: "109" as const };
  const entrada = await db.remessaCobrancaItem.findFirst({
    where: { contaReceberId: t.id, nossoNumero: t.nossoNumero, ocorrencia: "01", status: { not: "CANCELADO" } },
    orderBy: { id: "desc" },
    include: { remessa: { select: { criadaEm: true } } },
  });
  const saldo = toNumber(t.valor) - toNumber(t.valorBaixado);
  const valor = entrada ? toNumber(entrada.valor) : saldo;
  const valorCent = Math.round(valor * 100);
  const barras = codigoBarras44(ben, { nossoNumero: t.nossoNumero, vencimento: t.vencimento, valorCentavos: valorCent });
  const itf = barrasITF(barras);
  const h = t.hospital;
  const e = empresa();
  const processamento = diaBrasilia(entrada?.remessa.criadaEm ?? t.criadoEm);
  const dataDoc = emissaoDocumento(t.competencia, processamento);
  const multa = Math.round((valorCent * toNumber(conta.cobrancaMultaPercent)) / 100) / 100;
  const juros = jurosDiaCentavos(valorCent, toNumber(conta.cobrancaJurosMensalPercent)) / 100;
  const diaSeguinte = new Date(t.vencimento.getTime() + 86_400_000);
  const linha = linhaDigitavel(barras);
  const cel = "border-r border-slate-400 p-1";
  const rot = "text-slate-500";

  return (
    <>
      <div className="print:hidden">
        <PageHeader voltar={voltar} title="Boleto de cobrança" subtitle="Confira os dados e imprima. Pagável em qualquer banco até o vencimento." actions={<PrintButton />} />
        {Math.abs(saldo - valor) > 0.004 && (
          <Aviso tom="alerta" className="mb-3">
            O boleto foi registrado com {money(valor)}, mas o saldo do título agora é {money(saldo)}. O banco cobra o valor registrado: peça a baixa do boleto (02) e emita outro.
          </Aviso>
        )}
      </div>
      <div className="mx-auto mt-4 max-w-3xl border border-slate-400 bg-white p-4 text-sm text-slate-900">
        <CabecalhoImpresso />
        <div className="mb-1 text-xs font-semibold">Recibo do pagador</div>
        <div className="flex items-end justify-between border-b border-slate-400 pb-2">
          <div className="text-lg font-bold">Banco Itaú S.A. | 341-7</div>
          <div className="font-mono text-sm">{linha}</div>
        </div>
        <div className="border-b border-slate-400 p-1 text-xs">
          <div className={rot}>Local de pagamento</div>
          ATÉ O VENCIMENTO, PAGUE EM QUALQUER BANCO OU CORRESPONDENTE NÃO BANCÁRIO. APÓS O VENCIMENTO, ACESSE ITAU.COM.BR/BOLETOS E PAGUE EM QUALQUER BANCO OU CORRESPONDENTE NÃO BANCÁRIO.
        </div>
        <div className="grid grid-cols-3 gap-0 border-b border-slate-400 text-xs">
          <div className={`col-span-2 ${cel}`}><div className={rot}>Beneficiário</div>{conta.titularNome} — CNPJ {conta.titularCnpj}<div>{[e.endereco, e.cidade, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" - ")}</div></div>
          <div className="p-1"><div className={rot}>Agência / Código do beneficiário</div>{ben.agencia} / {ben.conta}-{ben.dac}</div>
        </div>
        <div className="grid grid-cols-5 gap-0 border-b border-slate-400 text-xs">
          <div className={cel}><div className={rot}>Data do documento</div>{date(dataDoc)}</div>
          <div className={cel}><div className={rot}>Nº do documento</div>{t.pedidoId ? `PV${t.pedidoId}` : t.nossoNumero}</div>
          <div className={cel}><div className={rot}>Espécie doc.</div>DM ({ESPECIES["01"]})</div>
          <div className={cel}><div className={rot}>Aceite</div>N</div>
          <div className="p-1"><div className={rot}>Data do processamento</div>{date(processamento)}</div>
        </div>
        <div className="grid grid-cols-5 gap-0 border-b border-slate-400 text-xs">
          <div className={cel}><div className={rot}>Carteira</div>{ben.carteira}</div>
          <div className={cel}><div className={rot}>Espécie</div>R$</div>
          <div className={cel}><div className={rot}>Nosso número</div>{nossoNumeroComDac(ben, t.nossoNumero)}</div>
          <div className={cel}><div className={rot}>Vencimento</div><strong>{date(t.vencimento)}</strong></div>
          <div className="p-1"><div className={rot}>(=) Valor do documento</div><strong>{money(valor)}</strong></div>
        </div>
        <div className="border-b border-slate-400 p-1 text-xs">
          <div className={rot}>Instruções de responsabilidade do BENEFICIÁRIO. Qualquer dúvida sobre este Boleto, contate o BENEFICIÁRIO.</div>
          {/* anexo 1, 16: condições em valores e datas, nunca em percentual ou dias */}
          {multa > 0 && <div>Após {date(t.vencimento)}, multa de {money(multa)}.</div>}
          {juros > 0 && <div>A partir de {date(diaSeguinte)}, juros de {money(juros)} por dia de atraso.</div>}
        </div>
        <div className="border-b border-slate-400 p-1 text-xs">
          <div className={rot}>Pagador</div>
          {h ? `${h.razaoSocial} — CNPJ ${h.cnpj}` : "—"}
          {h && <div>{[h.endereco, h.bairro, h.cep, h.cidade && `${h.cidade}/${h.uf ?? ""}`].filter(Boolean).join(" — ")}</div>}
        </div>
        <svg className="mt-3" viewBox={`0 0 ${itf.largura} 1`} preserveAspectRatio="none" style={{ width: "103mm", maxWidth: "100%", height: "13mm" }} role="img" aria-label={`Código de barras ${barras}`}>
          {itf.barras.map((b, i) => (
            <rect key={i} x={b.x} y={0} width={b.w} height={1} fill="#000" />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Linha digitável: {linha}</span>
          <span>Autenticação mecânica — Ficha de Compensação</span>
        </div>
      </div>
    </>
  );
}
