"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj } from "../../cadastros/_lib/documentos";
import { addDias, hojeUTC } from "./datas";

const schemaConta = z.object({
  nome: zf.text(),
  tipo: z.enum(["BANCO", "CAIXA"], { error: "Escolha o tipo" }),
  banco: zf.optText(),
  agencia: zf.optText(),
  numero: zf.optText(),
  saldoInicial: z.coerce.number({ error: "Valor inválido" }),
  titularCnpj: zf.optText(),
  titularNome: zf.optText(),
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
  let savedId: string;
  try {
    const saved = id
      ? await db.contaBancaria.update({ where: { id }, data: parsed.data })
      : await db.contaBancaria.create({ data: parsed.data });
    savedId = saved.id;
    await audit(user.id, id ? "editar" : "criar", "ContaBancaria", savedId, saved.nome);
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
    const c = await db.contaBancaria.findUniqueOrThrow({ where: { id } });
    await db.contaBancaria.update({ where: { id }, data: { ativo: !c.ativo } });
    await audit(user.id, c.ativo ? "inativar" : "ativar", "ContaBancaria", id, c.nome);
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
  categoria: zf.optText(),
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
    const conta = await db.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
    if (!conta?.ativo) return { error: "Conta inexistente ou inativa." };
    const l = await db.lancamento.create({ data: { contaId, ...d } });
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
  try {
    const l = await db.lancamento.findUnique({ where: { id }, select: { contaId: true, contaReceberId: true, contaPagarId: true, extrato: { select: { id: true } } } });
    if (!l) return { error: "Lançamento não encontrado." };
    if (l.contaReceberId || l.contaPagarId) return { error: "Este lançamento é baixa de título. Estorne pela tela do título." };
    if (l.extrato) return { error: "Lançamento conciliado com o extrato. Desfaça a conciliação antes." };
    await db.lancamento.delete({ where: { id } });
    await audit(user.id, "excluir lançamento", "Lancamento", id);
    revalidatePath(`/financeiro/contas/${l.contaId}`);
    revalidatePath("/financeiro/contas");
    revalidatePath("/financeiro/fluxo");
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}
