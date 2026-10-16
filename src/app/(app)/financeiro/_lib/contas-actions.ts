"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj } from "@/lib/documentos-br";
import { addDias, hojeUTC } from "@/lib/datas";
import { alternarAtivoContaTx, excluirLancamentoAvulsoTx, lancarAvulsoTx, salvarContaTx } from "./contas-servico";
import { estornarTransferencia, transferir } from "./titulos";

const schemaConta = z.object({
  nome: zf.text(),
  tipo: z.enum(["BANCO", "CAIXA"], { error: "Escolha o tipo" }),
  banco: zf.optText(),
  agencia: zf.optText(),
  numero: zf.optText(),
  saldoInicial: z.coerce.number({ error: "Valor inválido" }),
  titularCnpj: zf.optText(),
  titularNome: zf.optText(),
  carteiraCobranca: z.enum(["109"], { error: "Carteira inválida" }).optional().transform((v) => v ?? null),
  cobrancaMultaPercent: z.coerce.number().min(0, "Entre 0 e 20").max(20, "Entre 0 e 20").default(2),
  cobrancaJurosMensalPercent: z.coerce.number().min(0, "Entre 0 e 20").max(20, "Entre 0 e 20").default(1),
});

export async function salvarConta(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaConta, fd);
  if (!parsed.success) return parsed.state;
  if (parsed.data.titularCnpj) {
    const c = checarCnpj(parsed.data.titularCnpj);
    if (!c.ok) return { error: "Verifique os campos destacados.", fieldErrors: { titularCnpj: c.error } };
    parsed.data.titularCnpj = c.value;
  }
  if (parsed.data.carteiraCobranca && (!parsed.data.titularCnpj || !parsed.data.agencia || !parsed.data.numero)) {
    return { error: "Para habilitar a cobrança, informe agência, número da conta e CNPJ do titular." };
  }
  let savedId: string;
  try {
    const saved = await db.$transaction((tx) => salvarContaTx(tx, id, parsed.data));
    savedId = saved.id;
    await audit(user.id, id ? "editar" : "criar", "ContaBancaria", savedId, saved.mudancas ? `${saved.nome} — ${saved.mudancas}` : saved.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/financeiro/contas");
  if (!id) redirect(`/financeiro/contas/${savedId}`);
  return { ok: true };
}

export async function alternarAtivoConta(id: string): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  try {
    const c = await alternarAtivoContaTx(db, id);
    await audit(user.id, c.eraAtiva ? "inativar" : "ativar", "ContaBancaria", id, c.nome);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/financeiro/contas");
  revalidatePath(`/financeiro/contas/${id}`);
  return { ok: true };
}

const schemaAvulso = z.object({
  sentido: z.enum(["ENTRADA", "SAIDA"], { error: "Escolha entrada ou saída" }),
  descricao: zf.text(),
  planoContaId: zf.text("Escolha a conta do plano"),
  centroCustoId: zf.optText(),
  valor: zf.money().refine((v) => v > 0, "Informe um valor maior que zero"),
  data: zf.date("Informe a data"),
});

/** Lançamento sem título (tarifa, rendimento, transferência entre contas...). */
export async function lancarAvulso(contaId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaAvulso, fd);
  if (!parsed.success) return parsed.state;
  const d = parsed.data;
  if (d.data > addDias(hojeUTC(), 1)) return { fieldErrors: { data: "Data não pode ser futura" }, error: "Verifique os campos destacados." };
  try {
    const l = await db.$transaction((tx) => lancarAvulsoTx(tx, contaId, d));
    await audit(user.id, "lançar", "Lancamento", l.id, `${d.sentido} ${money(d.valor)} — ${d.descricao}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/financeiro/contas/${contaId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/fluxo");
  return { ok: true };
}

/** Exclui um lançamento avulso não conciliado. Baixas de título são estornadas no título. */
export async function excluirAvulso(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const id = fd.get("id");
  if (typeof id !== "string" || !id) return { error: "Lançamento inválido." };
  let contaId: string;
  try {
    contaId = await db.$transaction((tx) => excluirLancamentoAvulsoTx(tx, id));
    await audit(user.id, "excluir lançamento", "Lancamento", id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/financeiro/contas/${contaId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/fluxo");
  return { ok: true };
}

const schemaTransferencia = z.object({
  origemId: zf.text("Escolha a conta de origem"),
  destinoId: zf.text("Escolha a conta de destino"),
  valor: zf.money().refine((v) => v > 0, "Informe um valor maior que zero"),
  data: zf.date("Informe a data"),
  descricao: z.string().optional().transform((v) => v?.slice(0, 120) || "Transferência entre contas"),
});

/** Transferência entre contas próprias: não é receita nem despesa, só muda o dinheiro de lugar. */
export async function transferirEntreContas(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaTransferencia, fd);
  if (!parsed.success) return parsed.state;
  const d = parsed.data;
  if (d.data > addDias(hojeUTC(), 1)) return { fieldErrors: { data: "Data não pode ser futura" }, error: "Verifique os campos destacados." };
  try {
    const t = await db.$transaction((tx) => transferir(tx, d));
    await audit(user.id, "transferir", "Transferencia", t.id, `${money(d.valor)} de ${d.origemId} para ${d.destinoId}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/contas", "/financeiro", "/financeiro/fluxo", "/financeiro/conciliacao"]) revalidatePath(p);
  return { ok: true };
}

export async function estornarTransferenciaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const id = fd.get("id");
  if (typeof id !== "string" || !id) return { error: "Transferência inválida." };
  try {
    await db.$transaction((tx) => estornarTransferencia(tx, id));
    await audit(user.id, "estornar transferência", "Transferencia", id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  for (const p of ["/financeiro/contas", "/financeiro", "/financeiro/fluxo", "/financeiro/conciliacao"]) revalidatePath(p);
  return { ok: true };
}
