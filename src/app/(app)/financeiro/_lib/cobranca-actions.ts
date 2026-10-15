"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, type ActionState } from "@/lib/forms";
import { decodificarOfx, OFX_MAX_BYTES } from "./ofx";
import { lerRetornoCobranca } from "./cobranca";
import { aplicarRetornoCobrancaTx, cancelarRemessaCobrancaTx, contagemCobrancaVazia, gerarRemessaCobrancaTx } from "./cobranca-servico";

function revalidar(id?: number) {
  for (const p of ["/financeiro/cobranca", "/financeiro/receber", "/financeiro/fluxo", "/financeiro/contas", "/financeiro/conciliacao", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/financeiro/cobranca/${id}`);
}

const ids = (fd: FormData, campo: string) => [...new Set(fd.getAll(campo).filter((v): v is string => typeof v === "string" && v.length > 0))];

/** Gera a remessa de cobrança (entrada de boletos e pedidos de baixa). */
export async function gerarCobranca(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const contaId = String(fd.get("contaId") ?? "");
  const entrada = ids(fd, "tituloId");
  const baixa = ids(fd, "baixaId");
  if (!contaId) return { error: "Escolha a conta de cobrança." };
  if (entrada.length + baixa.length === 0) return { error: "Selecione ao menos um título." };
  if (entrada.length + baixa.length > 400) return { error: "Máximo de 400 títulos por remessa." };
  let remessaId: number;
  try {
    const r = await db.$transaction((tx) => gerarRemessaCobrancaTx(tx, { contaId, ids: entrada, baixaIds: baixa }));
    remessaId = r.remessaId;
    await audit(user.id, "gerar remessa de cobrança", "RemessaCobranca", remessaId, `${entrada.length} boleto(s), ${baixa.length} pedido(s) de baixa`);
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
    const ret = lerRetornoCobranca(decodificarOfx(new Uint8Array(await file.arrayBuffer())));
    remessas = await db.$transaction((tx) => aplicarRetornoCobrancaTx(tx, ret, cont));
    await audit(
      user.id,
      "processar retorno de cobrança",
      "RemessaCobranca",
      [...remessas].join(","),
      `registrados ${cont.registrados}, rejeitados ${cont.rejeitados}, liquidados ${cont.liquidados}, baixados ${cont.baixados}, PAGAMENTO EM DUPLICIDADE ${cont.duplicados}, valor divergente ${cont.divergentes}, não reconhecidos ${cont.ignorados}, já processados ${cont.jaProcessados}`,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  for (const id of remessas) revalidatePath(`/financeiro/cobranca/${id}`);
  const resumo = `${cont.liquidados} boleto(s) pago(s) e baixado(s), ${cont.registrados} registrado(s), ${cont.rejeitados} rejeitado(s), ${cont.baixados} baixa(s)`;
  const alertas = [
    cont.duplicados ? `${cont.duplicados} pagamento(s) em DUPLICIDADE (título já quitado: o hospital pagou duas vezes, providencie a devolução)` : "",
    cont.divergentes ? `${cont.divergentes} com valor diferente do saldo (confira o título)` : "",
    cont.ignorados ? `${cont.ignorados} registro(s) não reconhecido(s) ou sem efeito` : "",
  ].filter(Boolean);
  if (alertas.length) return { ok: true, aviso: `Retorno processado: ${resumo}. Atenção: ${alertas.join("; ")}.` };
  if (cont.jaProcessados > 0 && remessas.size === 0) return { ok: true, aviso: `Este retorno já tinha sido processado (${cont.jaProcessados} registro(s)); nada mudou.` };
  return { ok: true, aviso: `Retorno processado: ${resumo}.` };
}

export async function cancelarRemessaCobranca(remessaId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
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
