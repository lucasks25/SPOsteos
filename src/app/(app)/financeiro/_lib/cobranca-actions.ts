"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { argInt } from "@/lib/auth-args";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { decodificarOfx, OFX_MAX_BYTES } from "./ofx";
import { lerRetornoCobranca } from "./cobranca";
import { aplicarRetornoCobrancaTx, cancelarRemessaCobrancaTx, contagemCobrancaVazia, gerarRemessaCobrancaTx } from "./cobranca-servico";

function revalidar(id?: number) {
  for (const p of ["/financeiro/cobranca", "/financeiro/receber", "/financeiro/fluxo", "/financeiro/contas", "/financeiro/conciliacao", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/financeiro/cobranca/${id}`);
}

const ids = (fd: FormData, campo: string) => [...new Set(fd.getAll(campo).filter((v): v is string => typeof v === "string" && v.length > 0))];

/** Alterações de vencimento marcadas: caixa `alterarId` + data `vencimento_<id>` (AAAA-MM-DD). Devolve erro de campo se faltar a data. */
function alteracoesDe(fd: FormData): { ok: { id: string; vencimento: Date }[] } | { erro: string; campo: string } {
  const ok: { id: string; vencimento: Date }[] = [];
  for (const id of ids(fd, "alterarId")) {
    const v = fd.get(`vencimento_${id}`);
    const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
    const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!m || !d || d.getUTCDate() !== Number(m[3]) || d.getUTCFullYear() > 2100) return { erro: "Informe o novo vencimento dos boletos marcados para alteração.", campo: `vencimento_${id}` };
    ok.push({ id, vencimento: d });
  }
  return { ok };
}

/** Gera a remessa de cobrança (entrada de boletos e pedidos de baixa). */
export async function gerarCobranca(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const contaId = String(fd.get("contaId") ?? "");
  const entrada = ids(fd, "tituloId");
  const baixa = ids(fd, "baixaId");
  const alt = alteracoesDe(fd);
  if ("erro" in alt) return { error: alt.erro, fieldErrors: { [alt.campo]: "Informe a data" } };
  const alteracoes = alt.ok;
  if (!contaId) return { error: "Escolha a conta de cobrança." };
  const total = entrada.length + baixa.length + alteracoes.length;
  if (total === 0) return { error: "Selecione ao menos um título." };
  if (total > 400) return { error: "Máximo de 400 títulos por remessa." };
  let remessaId: number;
  try {
    const r = await db.$transaction((tx) => gerarRemessaCobrancaTx(tx, { contaId, ids: entrada, baixaIds: baixa, alteracoes }));
    remessaId = r.remessaId;
    const venc = alteracoes.map((a) => `${a.id} → ${a.vencimento.toISOString().slice(0, 10)}`).join(", ");
    await audit(user.id, "gerar remessa de cobrança", "RemessaCobranca", remessaId, `${entrada.length} boleto(s), ${baixa.length} pedido(s) de baixa, ${alteracoes.length} alteração(ões) de vencimento${venc ? ` (${venc})` : ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(remessaId);
  redirect(`/financeiro/cobranca/${remessaId}`);
}

/** Processa o retorno de cobrança do Itaú: confirma registros, baixa as liquidações e acusa duplicidade. */
export async function processarRetornoCobranca(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const file = fd.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo de retorno." };
  if (file.size > OFX_MAX_BYTES) return { error: "Arquivo maior que 5 MB." };
  const cont = contagemCobrancaVazia();
  let remessas = new Set<number>();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex"); // rastro do arquivo importado na auditoria
    const ret = lerRetornoCobranca(decodificarOfx(bytes));
    remessas = await db.$transaction((tx) => aplicarRetornoCobrancaTx(tx, ret, cont));
    await audit(
      user.id,
      "processar retorno de cobrança",
      "RemessaCobranca",
      [...remessas].join(","),
      `registrados ${cont.registrados}, rejeitados ${cont.rejeitados}, liquidados ${cont.liquidados}, baixados ${cont.baixados}, vencimentos alterados ${cont.alterados}, instruções recusadas ${cont.instrucoesRejeitadas}, já conciliados pelo extrato ${cont.jaConciliados}, PAGAMENTO EM DUPLICIDADE ${cont.duplicados}, valor divergente ${cont.divergentes}, não reconhecidos ${cont.ignorados}, já processados ${cont.jaProcessados}; arquivo sha256 ${sha}`,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  for (const id of remessas) revalidatePath(`/financeiro/cobranca/${id}`);
  const resumo =
    `${cont.liquidados} boleto(s) pago(s) e baixado(s), ${cont.registrados} registrado(s), ${cont.rejeitados} rejeitado(s), ${cont.baixados} baixa(s)` +
    (cont.alterados ? `, ${cont.alterados} vencimento(s) alterado(s) no título` : "") +
    (cont.jaConciliados ? `, ${cont.jaConciliados} já baixado(s) pela conciliação (mesmo pagamento)` : "");
  const alertas = [
    cont.duplicados ? `${cont.duplicados} pagamento(s) em DUPLICIDADE (título já quitado: o hospital pagou duas vezes, providencie a devolução)` : "",
    cont.divergentes ? `${cont.divergentes} com valor diferente do saldo (confira o título)` : "",
    cont.instrucoesRejeitadas ? `${cont.instrucoesRejeitadas} pedido(s) de baixa ou alteração recusado(s) pelo banco (o boleto continua como estava; veja os motivos na remessa)` : "",
    cont.ignorados ? `${cont.ignorados} registro(s) não reconhecido(s) ou sem efeito` : "",
  ].filter(Boolean);
  if (alertas.length) return { ok: true, aviso: `Retorno processado: ${resumo}. Atenção: ${alertas.join("; ")}.` };
  if (cont.jaProcessados > 0 && remessas.size === 0) return { ok: true, aviso: `Este retorno já tinha sido processado (${cont.jaProcessados} registro(s)); nada mudou.` };
  return { ok: true, aviso: `Retorno processado: ${resumo}.` };
}

export async function cancelarRemessaCobranca(remessaId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  remessaId = argInt(remessaId);
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (motivo.length < 5) return { fieldErrors: { motivo: "Explique o motivo (mínimo 5 letras)" }, error: "Verifique os campos destacados." };
  try {
    await db.$transaction((tx) => cancelarRemessaCobrancaTx(tx, remessaId, motivo));
    await audit(user.id, "cancelar remessa de cobrança", "RemessaCobranca", remessaId, motivo);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(remessaId);
  return { ok: true };
}
