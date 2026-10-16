import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { date } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { recolhimentoAtivoDoLote } from "./recolhimento-servico";
import { docRecolhimento } from "./recolhimento";

/**
 * Inspeção de recebimento e baixa de vencidos: regra transacional fora de "use server" (testável sem login).
 * O saldo da quarentena só sai por movimentar() (documento "INSP-<id>").
 */

export type DadosInspecao = {
  resultado: "LIBERADO" | "NAO_CONFORME" | "BLOQUEADO";
  embalagemOk: boolean;
  rotulagemOk: boolean;
  documentacaoOk: boolean;
  observacao?: string | null;
  inspetor: string;
};

/** Registra a inspeção, muda o status do lote e move o saldo da quarentena (liberado vai ao depósito; os demais ao não conforme). */
export async function inspecionarLoteServico(tx: Tx, loteId: string, data: DadosInspecao): Promise<{ movido: number }> {
  const lote = await tx.lote.findUnique({ where: { id: loteId }, include: { produto: true } });
  if (!lote) throw new ErroNegocio("Lote não encontrado.");
  const rec = await recolhimentoAtivoDoLote(tx, loteId);
  if (rec) throw new ErroNegocio(`Lote em recolhimento (${docRecolhimento(rec)}): não pode ser inspecionado nem liberado até o recolhimento terminar.`);
  const hoje = hojeUTC();
  if (data.resultado === "LIBERADO") {
    if (lote.validade < hoje) throw new ErroNegocio(`Lote vencido em ${date(lote.validade)} — não pode ser liberado.`);
    if (lote.produto.validadeRegistro && lote.produto.validadeRegistro < hoje) {
      throw new ErroNegocio(`Registro ANVISA do produto vencido em ${date(lote.produto.validadeRegistro)} — não pode ser liberado.`);
    }
  }
  const saldo = await tx.saldo.findUnique({ where: { loteId_localId: { loteId, localId: LOCAIS.QUARENTENA } } });
  const insp = await tx.inspecao.create({
    data: {
      loteId,
      resultado: data.resultado,
      embalagemOk: data.embalagemOk,
      rotulagemOk: data.rotulagemOk,
      documentacaoOk: data.documentacaoOk,
      observacao: data.observacao,
      inspetor: data.inspetor,
    },
  });
  await tx.lote.update({ where: { id: loteId }, data: { status: data.resultado } });
  const movido = saldo?.quantidade ?? 0;
  if (movido > 0) {
    await movimentar(tx, {
      tipo: "TRANSFERENCIA",
      produtoId: lote.produtoId,
      loteId,
      quantidade: movido,
      origemId: LOCAIS.QUARENTENA,
      destinoId: data.resultado === "LIBERADO" ? LOCAIS.DEPOSITO : LOCAIS.NAO_CONFORME,
      custoUnit: Number(lote.produto.custoMedio.toString()),
      documento: `INSP-${insp.id}`,
      observacao: `Inspeção de recebimento: ${data.resultado}`,
      usuario: data.inspetor,
    });
  }
  return { movido };
}

/** Marca como VENCIDO os lotes LIBERADOS com validade anterior a hoje. Devolve os lotes afetados. */
export async function marcarVencidosServico(tx: Tx): Promise<{ id: string; numero: string }[]> {
  const alvo = await tx.lote.findMany({ where: { status: "LIBERADO", validade: { lt: hojeUTC() } }, select: { id: true, numero: true } });
  if (alvo.length === 0) throw new ErroNegocio("Nenhum lote liberado vencido encontrado.");
  await tx.lote.updateMany({ where: { id: { in: alvo.map((l) => l.id) }, status: "LIBERADO" }, data: { status: "VENCIDO" } });
  return alvo;
}
