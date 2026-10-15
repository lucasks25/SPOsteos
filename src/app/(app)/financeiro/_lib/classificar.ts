import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";

export type ItemClassificar = { tipo: "receber" | "pagar" | "avulso"; id: string };

/** "receber:abc" → item. Ignora o que não for no formato. */
export function lerItens(valores: FormDataEntryValue[]): ItemClassificar[] {
  const vistos = new Set<string>();
  const out: ItemClassificar[] = [];
  for (const v of valores) {
    const m = typeof v === "string" ? /^(receber|pagar|avulso):([\w-]+)$/.exec(v) : null;
    if (m && !vistos.has(v as string)) {
      vistos.add(v as string);
      out.push({ tipo: m[1] as ItemClassificar["tipo"], id: m[2] });
    }
  }
  return out;
}

/**
 * Aplica conta do plano (e centro de custo, se informado) a vários itens sem classificação, tudo ou nada.
 * Só classifica quem ainda não tem conta do plano, para não sobrescrever o trabalho de outra pessoa, e recusa mês fechado.
 */
export async function classificarEmLote(tx: Tx, itens: ItemClassificar[], planoContaId: string, centroCustoId: string | null) {
  if (itens.length === 0) throw new ErroNegocio("Selecione ao menos um item.");
  if (itens.length > 500) throw new ErroNegocio("Máximo de 500 itens por vez.");
  await validarClassificacao(tx, planoContaId, centroCustoId);
  const ids = (t: ItemClassificar["tipo"]) => itens.filter((i) => i.tipo === t).map((i) => i.id);
  const [cr, cp, av] = await Promise.all([
    tx.contaReceber.findMany({ where: { id: { in: ids("receber") } }, select: { id: true, competencia: true, planoContaId: true } }),
    tx.contaPagar.findMany({ where: { id: { in: ids("pagar") } }, select: { id: true, competencia: true, planoContaId: true } }),
    tx.lancamento.findMany({ where: { id: { in: ids("avulso") } }, select: { id: true, data: true, planoContaId: true, contaReceberId: true, contaPagarId: true, transferenciaId: true } }),
  ]);
  if (cr.length !== ids("receber").length || cp.length !== ids("pagar").length || av.length !== ids("avulso").length) throw new ErroNegocio("Algum item não existe mais. Recarregue a página.");
  if ([...cr, ...cp, ...av].some((x) => x.planoContaId)) throw new ErroNegocio("Algum item já foi classificado por outra pessoa. Recarregue a página.");
  if (av.some((l) => l.contaReceberId || l.contaPagarId || l.transferenciaId)) throw new ErroNegocio("Só lançamentos avulsos podem ser classificados aqui.");
  await garantirMesAberto(tx, [...cr.map((x) => x.competencia), ...cp.map((x) => x.competencia), ...av.map((x) => x.data)], "classificar itens dessa data");
  const data = { planoContaId, ...(centroCustoId ? { centroCustoId } : {}) };
  await tx.contaReceber.updateMany({ where: { id: { in: cr.map((x) => x.id) } }, data });
  await tx.contaPagar.updateMany({ where: { id: { in: cp.map((x) => x.id) } }, data });
  await tx.lancamento.updateMany({ where: { id: { in: av.map((x) => x.id) } }, data });
  return itens.length;
}
