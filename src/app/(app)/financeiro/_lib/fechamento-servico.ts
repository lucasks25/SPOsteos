import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { addMeses, hojeUTC, inicioMes } from "@/lib/datas";
import { carregarLinhasDre } from "./dre-dados";
import { rotuloMes } from "./fechamento";

/** Fechamento e reabertura de mês. Ficam fora de "use server" para serem testados sem login. */
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Fecha um mês já encerrado e sem lançamentos sem conta do plano. */
export async function fecharMesTx(tx: Tx, mes: string, usuarioId: string) {
  if (!MES.test(mes)) throw new ErroNegocio("Mês inválido.");
  const ini = new Date(`${mes}-01T00:00:00Z`);
  if (ini >= inicioMes(hojeUTC())) throw new ErroNegocio("Só é possível fechar meses que já terminaram.");
  if (await tx.fechamentoMes.findUnique({ where: { mes } })) throw new ErroNegocio("Este mês já está fechado.");
  const linhas = await carregarLinhasDre(ini, addMeses(ini, 1), null);
  const sem = linhas.filter((l) => l.tipo === null).length;
  if (sem > 0) throw new ErroNegocio(`Há ${sem} lançamento(s) sem conta do plano em ${rotuloMes(mes)}. Classifique-os antes de fechar (veja o DRE, linha "Não classificado").`);
  await tx.fechamentoMes.create({ data: { mes, usuarioId } });
}

/** Reabre um mês fechado. */
export async function reabrirMesTx(tx: Tx, mes: string) {
  const r = await tx.fechamentoMes.deleteMany({ where: { mes } });
  if (r.count === 0) throw new ErroNegocio("Este mês não está fechado.");
}
