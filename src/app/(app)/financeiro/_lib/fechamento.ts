import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

type Reader = { fechamentoMes: Tx["fechamentoMes"] };

/** "yyyy-mm" de um dia gravado como meia-noite UTC (competência, data de baixa, data de lançamento). */
export const mesDoDia = (d: Date) => d.toISOString().slice(0, 7);

export const rotuloMes = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`;

/** Recusa a operação se algum dos dias cai num mês fechado. `o que` descreve a operação para a mensagem. */
export async function garantirMesAberto(db: Reader, dias: (Date | null | undefined)[], oQue: string) {
  const meses = [...new Set(dias.filter((d): d is Date => !!d).map(mesDoDia))];
  if (meses.length === 0) return;
  const fechado = await db.fechamentoMes.findFirst({ where: { mes: { in: meses } }, orderBy: { mes: "asc" } });
  if (fechado) throw new ErroNegocio(`O mês ${rotuloMes(fechado.mes)} está fechado: não é possível ${oQue}. Reabra o mês em Fechamento para alterar.`);
}
