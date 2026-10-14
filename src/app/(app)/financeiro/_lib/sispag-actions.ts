"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money, toNumber } from "@/lib/format";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import type { FormaPagamento } from "@/generated/prisma/client";
import { addDias, hojeUTC, parseDia } from "./datas";
import { decodificarOfx, OFX_MAX_BYTES } from "./ofx";
import { gerarRemessaSispag, lerRetornoSispag, situacaoRetorno, type Pagamento } from "./sispag";
import { contaEDac, formaPrevista, type ModoRemessa } from "./sispag-regras";
import { registrarBaixa, saldoTitulo } from "./titulos";

const ATIVOS = ["ENVIADO", "AGENDADO"] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;

function revalidar(id?: number) {
  for (const p of ["/financeiro/remessas", "/financeiro/pagar", "/financeiro/fluxo", "/financeiro/contas", "/financeiro/conciliacao"]) revalidatePath(p);
  if (id) revalidatePath(`/financeiro/remessas/${id}`);
}

/** Gera a remessa SISPAG com as contas a pagar selecionadas. */
export async function gerarRemessaPagamentos(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const contaId = String(fd.get("contaId") ?? "");
  const modo = fd.get("modo") === "PIX" ? "PIX" : ("TED_BOLETO" as ModoRemessa);
  const dataPagto = parseDia(String(fd.get("dataPagto") ?? ""));
  const ids = [...new Set(fd.getAll("tituloId").filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!contaId) return { error: "Escolha a conta a debitar." };
  if (!dataPagto || dataPagto < hojeUTC()) return { error: "Informe uma data de pagamento a partir de hoje." };
  if (dataPagto > addDias(hojeUTC(), 365)) return { error: "Data de pagamento muito distante." };
  if (ids.length === 0) return { error: "Selecione ao menos uma conta a pagar." };
  if (ids.length > 500) return { error: "Máximo de 500 pagamentos por remessa." };

  let remessaId: number;
  try {
    const conta = await db.contaBancaria.findUnique({ where: { id: contaId } });
    if (!conta?.ativo || conta.tipo !== "BANCO") return { error: "Conta bancária inexistente ou inativa." };
    const cd = contaEDac(conta.numero);
    if (!conta.titularCnpj || !conta.titularNome || !conta.agencia || !cd) {
      return { error: "Complete a conta bancária (agência, conta com dígito, CNPJ e razão social do titular) antes de gerar a remessa." };
    }
    const titulos = await db.contaPagar.findMany({
      where: { id: { in: ids } },
      include: { fornecedor: true, pagamentos: { where: { status: { in: [...ATIVOS] } }, select: { id: true } } },
    });
    if (titulos.length !== ids.length) return { error: "Algum título selecionado não existe mais. Recarregue a página." };

    const erros: string[] = [];
    const planos = titulos.map((t) => {
      const saldo = r2(toNumber(t.valor) - toNumber(t.valorBaixado));
      const f = formaPrevista(t, t.fornecedor, modo);
      if (t.status !== "ABERTO") erros.push(`${t.descricao}: não está em aberto`);
      else if (t.pagamentos.length) erros.push(`${t.descricao}: já está em outra remessa`);
      else if (saldo <= 0) erros.push(`${t.descricao}: sem saldo a pagar`);
      else if ("erro" in f) erros.push(`${t.descricao}: ${f.erro}`);
      return { t, saldo, forma: "forma" in f ? f.forma : null };
    });
    if (erros.length) return { error: `Corrija antes de gerar: ${erros.slice(0, 5).join("; ")}${erros.length > 5 ? ` (+${erros.length - 5})` : ""}.` };

    remessaId = await db.$transaction(async (tx) => {
      const rem = await tx.remessaPagamento.create({ data: { contaId, modo, dataPagto, conteudo: "" } });
      const pagamentos: Pagamento[] = [];
      for (const { t, saldo, forma } of planos) {
        const item = await tx.remessaPagamentoItem.create({ data: { remessaId: rem.id, contaPagarId: t.id, forma: forma!, valor: saldo } });
        const f = t.fornecedor!;
        const favorecido = { nome: f.razaoSocial, documento: f.cnpj, banco: f.bancoCodigo, agencia: f.agencia, conta: f.conta, digito: f.contaDigito, chavePix: f.chavePix };
        const seuNumero = `SP${item.id}`;
        if (forma === "30" || forma === "31") {
          const valorBarras = Number(t.codigoBarras!.slice(9, 19)) / 100;
          pagamentos.push({ forma, seuNumero, data: dataPagto, valor: saldo, codigoBarras: t.codigoBarras!, vencimento: t.vencimento, valorTitulo: valorBarras || saldo, favorecido });
        } else {
          pagamentos.push({ forma: forma as "01" | "41" | "45", seuNumero, data: dataPagto, valor: saldo, favorecido });
        }
      }
      const conteudo = gerarRemessaSispag({ cnpj: conta.titularCnpj!, nome: conta.titularNome!, agencia: conta.agencia!, conta: cd.conta, dac: cd.dac }, pagamentos, new Date());
      await tx.remessaPagamento.update({ where: { id: rem.id }, data: { conteudo } });
      return rem.id;
    });
    const total = planos.reduce((s, p) => s + p.saldo, 0);
    await audit(user.id, "gerar remessa SISPAG", "RemessaPagamento", remessaId, `${modo}: ${planos.length} pagamento(s), ${money(total)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(remessaId);
  redirect(`/financeiro/remessas/${remessaId}`);
}

const FORMA_BAIXA: Record<string, FormaPagamento> = { "45": "PIX", "30": "BOLETO", "31": "BOLETO", "01": "TED", "41": "TED" };

/** Processa o retorno do SISPAG: atualiza a situação de cada pagamento e baixa as contas pagas. */
export async function processarRetornoSispag(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const file = fd.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo de retorno." };
  if (file.size > OFX_MAX_BYTES) return { error: "Arquivo maior que 5 MB." };
  const cont = { pagos: 0, agendados: 0, rejeitados: 0, ignorados: 0, jaBaixados: 0, divergentes: 0 };
  const remessas = new Set<number>();
  try {
    const resultados = lerRetornoSispag(decodificarOfx(new Uint8Array(await file.arrayBuffer())));
    if (resultados.length === 0) return { error: "O retorno não traz nenhum pagamento." };
    await db.$transaction(async (tx) => {
      for (const r of resultados) {
        const m = /^SP(\d+)$/.exec(r.seuNumero);
        const item = m ? await tx.remessaPagamentoItem.findUnique({ where: { id: Number(m[1]) }, include: { remessa: true, contaPagar: { select: { status: true, valor: true, valorBaixado: true } } } }) : null;
        if (!item) {
          cont.ignorados++;
          continue;
        }
        remessas.add(item.remessaId);
        if (item.status === "PAGO") continue; // retorno reprocessado: não baixa de novo
        const status = situacaoRetorno(r.ocorrencias);
        await tx.remessaPagamentoItem.update({
          where: { id: item.id },
          data: { status, ocorrencias: r.ocorrencias.join(",") || null, nossoNumero: r.nossoNumero || item.nossoNumero },
        });
        if (status === "PAGO") {
          cont.pagos++;
          if (item.contaPagar.status === "ABERTO") {
            const saldoAtual = saldoTitulo(toNumber(item.contaPagar.valor), toNumber(item.contaPagar.valorBaixado));
            const pago = r.valorEfetivo || toNumber(item.valor);
            const dif = r2(pago - saldoAtual);
            const intocado = Math.abs(saldoAtual - toNumber(item.valor)) < 0.005; // ninguém mexeu no título desde a remessa
            if (dif > 0.004 && !intocado) {
              // pagou acima do saldo e o título mudou depois da remessa: não dá para saber o que é juros. Fica para a conciliação.
              await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...r.ocorrencias, "DIV"].join(",") } });
              cont.divergentes++;
            } else {
              await registrarBaixa(tx, {
                tipo: "pagar",
                tituloId: item.contaPagarId,
                contaId: item.remessa.contaId,
                data: r.dataEfetiva ?? item.remessa.dataPagto,
                valor: pago,
                juros: dif > 0.004 ? dif : 0, // acima do saldo: o excedente é juros/encargo cobrado pelo banco/fornecedor
                forma: FORMA_BAIXA[item.forma],
              });
            }
          } else cont.jaBaixados++;
        } else if (status === "AGENDADO") cont.agendados++;
        else cont.rejeitados++;
      }
      for (const id of remessas) await tx.remessaPagamento.update({ where: { id }, data: { retornoEm: new Date() } });
    });
    await audit(
      user.id,
      "processar retorno SISPAG",
      "RemessaPagamento",
      [...remessas].join(","),
      `pagos ${cont.pagos} (já baixados antes: ${cont.jaBaixados}), agendados ${cont.agendados}, rejeitados ${cont.rejeitados}, não reconhecidos ${cont.ignorados}, valor divergente (não baixados, concilie pelo extrato) ${cont.divergentes}`,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  for (const id of remessas) revalidatePath(`/financeiro/remessas/${id}`);
  if (remessas.size === 0) return { error: `Nenhum pagamento do arquivo pertence a remessas deste sistema (${cont.ignorados} não reconhecido(s)).` };
  return { ok: true };
}
