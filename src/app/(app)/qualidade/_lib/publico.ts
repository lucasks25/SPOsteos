import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/** API pública da qualidade (docs/ARQUITETURA.md, ADR-3): outros módulos gravam lote só por aqui, dentro da transação deles. */

export type LoteRecebido = {
  produtoId: string;
  numero: string;
  validade: Date;
  fabricacao: Date | null;
  serie: string | null;
};

/**
 * Registra o lote de uma entrada de mercadoria. Lote novo nasce em QUARENTENA; lote existente (produto + número) com a
 * mesma validade é reaproveitado (completa série e fabricação se estavam vazias); validade diferente é erro. Devolve o id.
 */
export async function registrarLoteRecebidoTx(tx: Tx, l: LoteRecebido): Promise<string> {
  const existente = await tx.lote.findUnique({ where: { produtoId_numero: { produtoId: l.produtoId, numero: l.numero } } });
  if (existente) {
    if (existente.validade.getTime() !== l.validade.getTime()) {
      throw new ErroNegocio(`O lote ${l.numero} já existe com validade diferente. Verifique os dados.`);
    }
    const extra: { serie?: string; fabricacao?: Date } = {};
    if (l.serie && !existente.serie) extra.serie = l.serie;
    if (l.fabricacao && !existente.fabricacao) extra.fabricacao = l.fabricacao;
    if (Object.keys(extra).length) await tx.lote.update({ where: { id: existente.id }, data: extra });
    return existente.id;
  }
  const novo = await tx.lote.create({
    data: { produtoId: l.produtoId, numero: l.numero, serie: l.serie, fabricacao: l.fabricacao, validade: l.validade, status: "QUARENTENA" },
  });
  return novo.id;
}
