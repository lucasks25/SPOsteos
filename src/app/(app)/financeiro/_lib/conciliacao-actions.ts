"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { decodificarOfx, OFX_MAX_BYTES } from "./ofx";
import { avulsoEConciliarTx, baixarEConciliarTx, conciliarComLancamentoTx, desfazerConciliacaoTx, excluirLinhaExtratoTx, importarExtratoTexto } from "./conciliacao-servico";

function revalidar() {
  for (const p of ["/financeiro/conciliacao", "/financeiro/contas", "/financeiro/receber", "/financeiro/pagar", "/financeiro/fluxo"]) revalidatePath(p);
}

/** Importa o extrato (OFX ou CNAB 240 do Itaú) numa conta. Linhas já importadas são ignoradas. */
export async function importarExtrato(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const contaId = fd.get("contaId");
  const file = fd.get("arquivo");
  if (typeof contaId !== "string" || !contaId) return { error: "Escolha a conta." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo do extrato." };
  if (file.size > OFX_MAX_BYTES) return { error: "Arquivo maior que 5 MB. Exporte um período menor." };
  try {
    const texto = decodificarOfx(new Uint8Array(await file.arrayBuffer()));
    const r = await importarExtratoTexto(contaId, texto);
    await audit(user.id, "importar extrato", "ContaBancaria", contaId, `${r.origem}: ${r.novas} nova(s), ${r.existentes} já existente(s)${r.detalhe}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Concilia a linha com um lançamento já existente (mesma conta, sentido e valor). */
export async function conciliarComLancamento(linhaId: string, lancamentoId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    await db.$transaction((tx) => conciliarComLancamentoTx(tx, linhaId, lancamentoId));
    await audit(user.id, "conciliar", "ExtratoLinha", linhaId, `lançamento ${lancamentoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

const schemaTitulo = z.object({
  tituloId: zf.text("Escolha o título"),
  juros: zf.money().default(0),
  multa: zf.money().default(0),
  desconto: zf.money().default(0),
});

/** Baixa um título com o valor e a data do extrato e já concilia. Crédito = a receber; débito = a pagar. */
export async function baixarEConciliar(linhaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaTitulo, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction((tx) => baixarEConciliarTx(tx, linhaId, parsed.data));
    await audit(user.id, "baixar e conciliar", "ExtratoLinha", linhaId, `título ${parsed.data.tituloId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

const schemaAvulso = z.object({ descricao: zf.text(), planoContaId: zf.text("Escolha a conta do plano"), centroCustoId: zf.optText() });

/** Cria um lançamento avulso (tarifa, rendimento...) com os dados do extrato e concilia. */
export async function avulsoEConciliar(linhaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaAvulso, fd);
  if (!parsed.success) return parsed.state;
  try {
    await db.$transaction((tx) => avulsoEConciliarTx(tx, linhaId, parsed.data));
    await audit(user.id, "lançar e conciliar", "ExtratoLinha", linhaId, `${parsed.data.descricao}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Desfaz a conciliação (o lançamento continua existindo). */
export async function desfazerConciliacao(linhaId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    await db.$transaction((tx) => desfazerConciliacaoTx(tx, linhaId));
    await audit(user.id, "desfazer conciliação", "ExtratoLinha", linhaId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}

/** Exclui uma linha de extrato ainda não conciliada (ex.: importada na conta errada). */
export async function excluirLinhaExtrato(linhaId: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    await db.$transaction((tx) => excluirLinhaExtratoTx(tx, linhaId));
    await audit(user.id, "excluir linha de extrato", "ExtratoLinha", linhaId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar();
  return { ok: true };
}
