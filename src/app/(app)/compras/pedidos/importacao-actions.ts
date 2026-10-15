"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { ErroNegocio } from "@/lib/erros";
import { CRITERIOS_RATEIO, INCOTERMS, MOEDAS, ROTULO_DESPESA, TIPOS_DESPESA } from "../_lib/custo-importacao";
import { removerDespesaTx, salvarDadosImportacaoTx, salvarDespesaTx, salvarItensImportacaoTx } from "../_lib/importacao-servico";
import { documentoPedido, PERFIS_COMPRAS } from "../_lib/perfis";

const revalidar = (pedidoId: number) => {
  for (const p of [`/compras/pedidos/${pedidoId}`, "/compras/pedidos", "/financeiro/pagar", "/financeiro/aprovacoes", "/financeiro/fluxo"]) revalidatePath(p);
};

const schemaDados = z.object({
  moeda: z.enum(MOEDAS, { error: "Moeda inválida" }),
  cambio: zf.optMoney(),
  tipoCambio: z.union([z.enum(["PTAX", "CONTRATADO"]), z.literal("")]).optional().transform((v) => v || null),
  incoterm: z.union([z.enum(INCOTERMS), z.literal("")]).optional().transform((v) => v || null),
  invoice: zf.optText(),
  numeroDi: zf.optText(),
  dataInvoice: zf.optDate(),
  dataRegistroDi: zf.optDate(),
  dataDesembaraco: zf.optDate(),
});

/** Dados da importação: moeda, câmbio, incoterm, invoice, DI e datas. */
export async function salvarImportacao(pedidoId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const parsed = parseForm(schemaDados, fd);
  if (!parsed.success) return parsed.state;
  try {
    const r = await db.$transaction((tx) => salvarDadosImportacaoTx(tx, pedidoId, parsed.data));
    const d = parsed.data;
    await audit(user.id, "editar", "PedidoCompra", pedidoId, `${documentoPedido(pedidoId)} — importação ${d.moeda}${d.cambio ? ` câmbio ${d.cambio}` : ""}${r.mudouCusto ? " (custo recalculado)" : ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}

/** Preço na moeda e peso de cada item (campos pm_<itemId> e kg_<itemId>; "preco*" ganharia máscara de R$). */
export async function salvarItensImportacao(pedidoId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const itens: { itemId: string; precoMoeda: number; pesoKg: number | null }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("pm_") || typeof v !== "string") continue;
    const itemId = k.slice(3);
    const preco = Number(v.replace(",", "."));
    const pesoTxt = String(fd.get(`kg_${itemId}`) ?? "").trim().replace(",", ".");
    const peso = pesoTxt === "" ? null : Number(pesoTxt);
    if (v.trim() === "" || !Number.isFinite(preco) || preco < 0) fieldErrors[k] = "Preço inválido";
    if (peso !== null && (!Number.isFinite(peso) || peso < 0)) fieldErrors[`kg_${itemId}`] = "Peso inválido";
    itens.push({ itemId, precoMoeda: preco, pesoKg: peso });
  }
  if (Object.keys(fieldErrors).length) return { error: "Corrija os campos destacados.", fieldErrors };
  try {
    await db.$transaction((tx) => salvarItensImportacaoTx(tx, pedidoId, itens));
    await audit(user.id, "editar", "PedidoCompra", pedidoId, `${documentoPedido(pedidoId)} — preços na moeda/pesos de ${itens.length} item(ns)`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}

const schemaDespesa = z.object({
  tipo: z.enum(TIPOS_DESPESA, { error: "Selecione o tipo" }),
  descricao: zf.optText(),
  valor: zf.money(),
  integra: z.enum(["PADRAO", "SIM", "NAO"]).default("PADRAO"),
  criterio: z.enum(CRITERIOS_RATEIO).default("VALOR"),
  itemId: zf.optText(),
  gerarConta: zf.bool(),
  fornecedorId: zf.optText(),
  vencimento: zf.optDate(),
});

/** Inclui (despesaId nulo) ou altera uma despesa de importação. */
export async function salvarDespesa(pedidoId: number, despesaId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  const parsed = parseForm(schemaDespesa, fd);
  if (!parsed.success) return parsed.state;
  const { integra, ...d } = parsed.data;
  if (d.gerarConta && !d.vencimento) return { error: "Informe o vencimento da conta a pagar.", fieldErrors: { vencimento: "Obrigatório para gerar a conta" } };
  try {
    const r = await db.$transaction((tx) =>
      salvarDespesaTx(tx, pedidoId, despesaId, { ...d, integraCusto: integra === "PADRAO" ? null : integra === "SIM" }),
    );
    await audit(
      user.id,
      despesaId ? "editar" : "criar",
      "PedidoCompraDespesa",
      r.id,
      `${documentoPedido(pedidoId)} — ${ROTULO_DESPESA[d.tipo]} R$ ${d.valor.toFixed(2)}${r.contaPagarId ? `, conta a pagar ${r.contaPagarId}` : ""}`,
    );
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}

/** Remove a despesa; a conta a pagar própria, se houver, é cancelada. */
export async function removerDespesa(pedidoId: number, despesaId: string): Promise<ActionState> {
  const user = await requireUser(PERFIS_COMPRAS);
  try {
    if (!despesaId) throw new ErroNegocio("Despesa inválida.");
    const r = await db.$transaction((tx) => removerDespesaTx(tx, pedidoId, despesaId));
    await audit(user.id, "excluir", "PedidoCompraDespesa", despesaId, `${documentoPedido(pedidoId)} — ${ROTULO_DESPESA[r.tipo]} R$ ${r.valor.toFixed(2)}${r.contaCancelada ? " (conta a pagar cancelada)" : ""}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(pedidoId);
  return { ok: true };
}
