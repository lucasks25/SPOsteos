"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argInt } from "@/lib/auth-args";
import { money } from "@/lib/format";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { addDias, hojeUTC, parseDia } from "@/lib/datas";
import { decodificarOfx, OFX_MAX_BYTES } from "./ofx";
import { contaDoRetorno, lerRetornoSispag } from "./sispag";
import type { ModoRemessa } from "./sispag-regras";
import { aplicarRetornoTx, cancelarRemessaTx, contagemVazia, gerarRemessaDaContaTx } from "./sispag-servico";

/** Lote grande (centenas de itens) com banco remoto passa dos 5 s do padrão do Prisma; vale por cima do padrão global. */
const TX_OPTS = { timeout: 60_000, maxWait: 10_000 };


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
    const r = await db.$transaction((tx) => gerarRemessaDaContaTx(tx, { contaId, modo, dataPagto, ids }), TX_OPTS);
    remessaId = r.remessaId;
    await audit(user.id, "gerar remessa SISPAG", "RemessaPagamento", remessaId, `${modo}: ${r.qtd} pagamento(s), ${money(r.total)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(remessaId);
  redirect(`/financeiro/remessas/${remessaId}`);
}

/** Processa o retorno do SISPAG: atualiza a situação de cada pagamento e baixa as contas pagas. */
export async function processarRetornoSispag(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const file = fd.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo de retorno." };
  if (file.size > OFX_MAX_BYTES) return { error: "Arquivo maior que 5 MB." };
  const cont = contagemVazia();
  const remessas = new Set<number>();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex"); // rastro do arquivo importado na auditoria
    const texto = decodificarOfx(bytes);
    const resultados = lerRetornoSispag(texto);
    const cabecalho = contaDoRetorno(texto);
    if (resultados.length === 0) return { error: "O retorno não traz nenhum pagamento." };
    for (const id of await db.$transaction((tx) => aplicarRetornoTx(tx, resultados, cont, cabecalho), TX_OPTS)) remessas.add(id);
    await audit(
      user.id,
      "processar retorno SISPAG",
      "RemessaPagamento",
      [...remessas].join(","),
      `pagos ${cont.pagos} (PAGAMENTO EM DUPLICIDADE, título já quitado antes: ${cont.jaBaixados}; remessa cancelada mas paga pelo banco: ${cont.canceladasPagas}), agendados ${cont.agendados}, rejeitados ${cont.rejeitados}, não reconhecidos ${cont.ignorados}, valor divergente (não baixados, concilie pelo extrato) ${cont.divergentes}, devolvidos depois de pagos ${cont.devolvidos}, já conciliados pelo extrato antes do retorno ${cont.jaConciliados}; arquivo sha256 ${sha}`,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  for (const id of remessas) revalidatePath(`/financeiro/remessas/${id}`);
  if (cont.jaBaixados > 0 || cont.canceladasPagas > 0 || cont.divergentes > 0 || cont.devolvidos > 0) {
    const partes = [
      cont.jaBaixados > 0 ? `${cont.jaBaixados} pagamento(s) em DUPLICIDADE (o título já estava quitado: peça a devolução ao fornecedor ou ao banco)` : "",
      cont.canceladasPagas > 0 ? `${cont.canceladasPagas} pagamento(s) de remessa cancelada que o banco pagou` : "",
      cont.divergentes > 0 ? `${cont.divergentes} com valor diferente do saldo (não baixados: concilie pelo extrato)` : "",
      cont.devolvidos > 0 ? `${cont.devolvidos} pagamento(s) DEVOLVIDO(S) pelo banco do favorecido depois de pagos (estorne a baixa e confira o extrato)` : "",
    ].filter(Boolean);
    return { ok: true, aviso: `Retorno processado, mas atenção: ${partes.join("; ")}.` };
  }
  if (cont.jaConciliados > 0) return { ok: true, aviso: `Retorno processado. ${cont.jaConciliados} pagamento(s) já tinham sido baixados pela conciliação do extrato (mesmo valor e data): nada a fazer.` };
  if (remessas.size === 0) return { error: `Nenhum pagamento do arquivo pertence a remessas deste sistema (${cont.ignorados} não reconhecido(s)).` };
  return { ok: true };
}

/**
 * Cancela uma remessa que ainda não foi enviada ao banco (ou foi recusada): libera os títulos para outra remessa.
 * Só é possível enquanto nenhum item estiver pago ou agendado, ou seja, antes de qualquer retorno que confirme pagamento.
 * Se o arquivo chegou a ser enviado e o banco pagar mesmo assim, o retorno acusa o caso (ocorrência CAN).
 */
export async function cancelarRemessa(remessaId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  remessaId = argInt(remessaId);
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (motivo.length < 5) return { fieldErrors: { motivo: "Explique o motivo (mínimo 5 letras)" }, error: "Verifique os campos destacados." };
  try {
    await db.$transaction((tx) => cancelarRemessaTx(tx, remessaId, motivo));
    await audit(user.id, "cancelar remessa SISPAG", "RemessaPagamento", remessaId, motivo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(remessaId);
  return { ok: true };
}
