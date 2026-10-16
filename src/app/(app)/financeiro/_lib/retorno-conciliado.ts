import "server-only";
import type { Tx } from "@/lib/db";

/** Janela, em dias, entre a data do pagamento informada pelo banco e a data da linha do extrato conciliada. */
export const JANELA_CONCILIADO_DIAS = 3;
const DIA = 86_400_000;

/**
 * O título já quitado foi baixado pela conciliação com o MESMO pagamento que o retorno (SISPAG ou cobrança) agora informa?
 * Critério: existe baixa do título, na mesma conta bancária, com o mesmo valor (ao centavo) e ligada a uma linha de extrato
 * com data a até ±3 dias da data do pagamento no retorno. Nesse caso o retorno só confirma o que já foi conciliado e não é
 * pagamento em duplicidade. Sem linha de extrato (baixa manual) continua sendo duplicidade: não há prova de que é o mesmo dinheiro.
 */
export async function pagamentoJaConciliado(
  tx: Tx,
  a: { tipo: "pagar" | "receber"; tituloId: string; contaId: string; valor: number; data: Date },
): Promise<boolean> {
  if (!(a.valor > 0)) return false;
  const de = new Date(a.data.getTime() - JANELA_CONCILIADO_DIAS * DIA);
  const ate = new Date(a.data.getTime() + JANELA_CONCILIADO_DIAS * DIA);
  const achado = await tx.lancamento.findFirst({
    where: {
      ...(a.tipo === "pagar" ? { contaPagarId: a.tituloId, sentido: "SAIDA" as const } : { contaReceberId: a.tituloId, sentido: "ENTRADA" as const }),
      contaId: a.contaId,
      valor: { gte: a.valor - 0.005, lte: a.valor + 0.005 },
      extrato: { is: { data: { gte: de, lte: ate } } },
    },
    select: { id: true },
  });
  return achado !== null;
}
