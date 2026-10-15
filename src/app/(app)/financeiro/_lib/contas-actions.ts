"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import { checarCnpj } from "../../cadastros/_lib/documentos";
import { ErroNegocio } from "@/lib/erros";
import { listarContas } from "./contas";
import { addDias, hojeUTC } from "./datas";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";
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
    if (c.ativo) {
      // conta inativa sai do saldo, do painel e do fluxo: com saldo diferente de zero, os números deixariam de fechar
      const conta = (await listarContas()).find((x) => x.id === id);
      if (conta && Math.abs(conta.saldo) >= 0.005) throw new ErroNegocio(`A conta tem saldo de ${money(conta.saldo)}. Zere o saldo (transferência ou lançamento) antes de inativá-la.`);
    }
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
    const conta = await db.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
    if (!conta?.ativo) return { error: "Conta inexistente ou inativa." };
    await validarClassificacao(db, d.planoContaId, d.centroCustoId);
    await garantirMesAberto(db, [d.data], "lançar nessa data");
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
    const l = await db.lancamento.findUnique({ where: { id }, select: { contaId: true, data: true, contaReceberId: true, contaPagarId: true, transferenciaId: true, extrato: { select: { id: true } } } });
    if (!l) return { error: "Lançamento não encontrado." };
    if (l.transferenciaId) return { error: "Este lançamento é parte de uma transferência. Estorne a transferência inteira." };
    if (l.contaReceberId || l.contaPagarId) return { error: "Este lançamento é baixa de título. Estorne pela tela do título." };
    if (l.extrato) return { error: "Lançamento conciliado com o extrato. Desfaça a conciliação antes." };
    await garantirMesAberto(db, [l.data], "excluir lançamento dessa data");
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
