"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { audit, errorMessage, parseForm, zf, type ActionState } from "@/lib/forms";
import type { FormaPagamento } from "@/generated/prisma/client";
import { FORMAS, TIPOS, isTipo, type Tipo } from "./config";
import { addDias, hojeUTC } from "./datas";
import { lerBoleto } from "./boleto";
import { validarClassificacao } from "./plano";
import { estornarBaixa, estornarGlosa, registrarBaixa, registrarGlosa } from "./titulos";
import { ErroNegocio } from "@/lib/erros";

const positivo = () => zf.money().refine((v) => v > 0, "Informe um valor maior que zero");

const schemaReceber = z.object({
  descricao: zf.text(),
  hospitalId: zf.optText(),
  planoContaId: zf.text("Escolha a conta do plano"),
  centroCustoId: zf.optText(),
  competencia: zf.date("Informe a competência"),
  valor: positivo(),
  vencimento: zf.date("Informe o vencimento"),
});

const schemaPagar = z.object({
  descricao: zf.text(),
  fornecedorId: zf.optText(),
  planoContaId: zf.text("Escolha a conta do plano"),
  centroCustoId: zf.optText(),
  competencia: zf.date("Informe a competência"),
  // boleto do fornecedor: aceita linha digitável ou código de barras; grava os 44 dígitos validados
  codigoBarras: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      try {
        return lerBoleto(v).codigoBarras;
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    }),
  valor: positivo(),
  vencimento: zf.date("Informe o vencimento"),
});

const schemaBaixa = z.object({
  contaId: zf.text("Escolha a conta"),
  valor: positivo(),
  juros: zf.money().default(0),
  multa: zf.money().default(0),
  desconto: zf.money().default(0),
  data: zf.date("Informe a data"),
  forma: z
    .string()
    .optional()
    .refine((v) => v === undefined || (FORMAS as readonly string[]).includes(v), "Forma inválida")
    .transform((v) => (v as FormaPagamento | undefined) ?? null),
});

const schemaId = z.object({ id: zf.text() });

function checkTipo(tipo: unknown): Tipo {
  if (!isTipo(tipo)) throw new ErroNegocio("Tipo de título inválido.");
  return tipo;
}

function revalidar(tipo: Tipo, id?: string) {
  revalidatePath(TIPOS[tipo].path);
  if (id) revalidatePath(`${TIPOS[tipo].path}/${id}`);
  revalidatePath("/financeiro/fluxo");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/");
}

/** Cria (id = null) ou edita um título em aberto e sem baixas. */
export async function salvarTitulo(tipoArg: Tipo, id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const tipo = checkTipo(tipoArg);
  let savedId: string;
  try {
    if (tipo === "receber") {
      const parsed = parseForm(schemaReceber, fd);
      if (!parsed.success) return parsed.state;
      const data = parsed.data;
      await validarClassificacao(db, data.planoContaId, data.centroCustoId);
      if (id) {
        const r = await db.contaReceber.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data });
        if (r.count === 0) return { error: "Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes." };
        savedId = id;
      } else {
        savedId = (await db.contaReceber.create({ data })).id;
      }
      await audit(user.id, id ? "editar" : "criar", "ContaReceber", savedId, `${data.descricao} — ${money(data.valor)}`);
    } else {
      const parsed = parseForm(schemaPagar, fd);
      if (!parsed.success) return parsed.state;
      const data = parsed.data;
      await validarClassificacao(db, data.planoContaId, data.centroCustoId);
      if (id) {
        const r = await db.contaPagar.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data });
        if (r.count === 0) return { error: "Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes." };
        savedId = id;
      } else {
        savedId = (await db.contaPagar.create({ data })).id;
      }
      await audit(user.id, id ? "editar" : "criar", "ContaPagar", savedId, `${data.descricao} — ${money(data.valor)}`);
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(tipo, savedId);
  if (!id) redirect(`${TIPOS[tipo].path}/${savedId}`);
  return { ok: true };
}

/** Baixa (recebimento/pagamento), total ou parcial, numa conta bancária ou caixa. */
export async function baixarTitulo(tipoArg: Tipo, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const tipo = checkTipo(tipoArg);
  const parsed = parseForm(schemaBaixa, fd);
  if (!parsed.success) return parsed.state;
  const { contaId, valor, juros, multa, desconto, data, forma } = parsed.data;
  if (data > addDias(hojeUTC(), 1)) return { fieldErrors: { data: "Data não pode ser futura" }, error: "Verifique os campos destacados." };
  try {
    await db.$transaction((tx) => registrarBaixa(tx, { tipo, tituloId: id, contaId, data, valor, juros, multa, desconto, forma }));
    await audit(user.id, "baixar", TIPOS[tipo].entidade, id, `${money(valor)} em ${data.toISOString().slice(0, 10)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(tipo, id);
  return { ok: true };
}

/** Estorna uma baixa específica (lançamento). */
export async function estornarBaixaAction(tipoArg: Tipo, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const tipo = checkTipo(tipoArg);
  const parsed = parseForm(schemaId, fd);
  if (!parsed.success) return { error: "Baixa inválida." };
  try {
    const tituloId = await db.$transaction((tx) => estornarBaixa(tx, tipo, parsed.data.id));
    await audit(user.id, "estornar baixa", TIPOS[tipo].entidade, tituloId, `lançamento ${parsed.data.id}`);
    revalidar(tipo, tituloId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}

/** Cancela um título em aberto e sem baixas. */
export async function cancelarTitulo(tipoArg: Tipo, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const tipo = checkTipo(tipoArg);
  const parsed = parseForm(schemaId, fd);
  if (!parsed.success) return { error: "Título inválido." };
  const { id } = parsed.data;
  const data = { status: "CANCELADO" as const };
  try {
    if (tipo === "receber") {
      // Cancelar a receita de uma NF emitida tiraria a venda do DRE e deixaria o custo (CMV): precisa de cancelamento de NF/devolução.
      const t = await db.contaReceber.findUnique({ where: { id }, select: { pedido: { select: { status: true } } } });
      if (t?.pedido?.status === "FATURADO") return { error: "Este título vem de uma NF emitida. Para desfazê-lo é preciso cancelar a NF ou registrar uma devolução." };
    }
    const where = { id, status: "ABERTO" as const, valorBaixado: null };
    const r = tipo === "receber" ? await db.contaReceber.updateMany({ where, data }) : await db.contaPagar.updateMany({ where, data });
    if (r.count === 0) return { error: "Só é possível cancelar títulos em aberto e sem baixas. Estorne as baixas antes." };
    await audit(user.id, "cancelar", TIPOS[tipo].entidade, id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(tipo, id);
  return { ok: true };
}

const schemaClassificar = z.object({ planoContaId: zf.text("Escolha a conta do plano"), centroCustoId: zf.optText(), competencia: zf.date("Informe a competência") });

/** Classifica (ou reclassifica) um título em qualquer situação: não mexe em valor nem em baixas. */
export async function classificarTitulo(tipoArg: Tipo, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const tipo = checkTipo(tipoArg);
  const parsed = parseForm(schemaClassificar, fd);
  if (!parsed.success) return parsed.state;
  const data = parsed.data;
  try {
    await validarClassificacao(db, data.planoContaId, data.centroCustoId);
    const r = tipo === "receber" ? await db.contaReceber.updateMany({ where: { id }, data }) : await db.contaPagar.updateMany({ where: { id }, data });
    if (r.count === 0) return { error: "Título não encontrado." };
    await audit(user.id, "classificar", TIPOS[tipo].entidade, id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar(tipo, id);
  revalidatePath("/financeiro/dre");
  return { ok: true };
}

const schemaGlosa = z.object({ valor: positivo(), data: zf.date("Informe a data"), motivo: zf.text("Informe o motivo") });

/** Registra glosa (o hospital não reconhece parte da cobrança): abate o título sem dinheiro e vai para Deduções no DRE. */
export async function glosarTitulo(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaGlosa, fd);
  if (!parsed.success) return parsed.state;
  const { valor, data, motivo } = parsed.data;
  if (data > addDias(hojeUTC(), 1)) return { fieldErrors: { data: "Data não pode ser futura" }, error: "Verifique os campos destacados." };
  try {
    const g = await db.$transaction((tx) => registrarGlosa(tx, { tituloId: id, valor, data, motivo }));
    await audit(user.id, "glosar", "ContaReceber", id, `${money(valor)} — ${motivo} (glosa ${g.id})`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidar("receber", id);
  revalidatePath("/financeiro/dre");
  return { ok: true };
}

export async function estornarGlosaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["FINANCEIRO"]);
  const parsed = parseForm(schemaId, fd);
  if (!parsed.success) return { error: "Glosa inválida." };
  try {
    const tituloId = await db.$transaction((tx) => estornarGlosa(tx, parsed.data.id));
    await audit(user.id, "estornar glosa", "ContaReceber", tituloId, parsed.data.id);
    revalidar("receber", tituloId);
    revalidatePath("/financeiro/dre");
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: true };
}
