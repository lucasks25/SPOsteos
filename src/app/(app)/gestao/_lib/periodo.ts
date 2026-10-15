/** Período dos relatórios de gestão: dias de Brasília, fim exclusivo (como no resto do sistema). Puro, testado em tests/gestao. */
import { addDias, inicioDiaBrasilia, parseDia, ymd } from "../../financeiro/_lib/datas";

export type Periodo = { de: string; ate: string; gte: Date; lt: Date };

/**
 * `de`/`ate` vêm da querystring (yyyy-mm-dd, inclusive). Vazio ou inválido usa os últimos `padraoDias`
 * dias até `hoje` (meia-noite UTC do dia de Brasília). `de` depois de `ate` troca os dois.
 * gte = início do dia `de` em Brasília; lt = início do dia seguinte a `ate` (fim exclusivo).
 */
export function periodoDe(deStr: string | string[] | undefined, ateStr: string | string[] | undefined, hoje: Date, padraoDias = 90): Periodo {
  let ate = parseDia(ateStr) ?? hoje;
  let de = parseDia(deStr) ?? addDias(ate, -(padraoDias - 1));
  if (de.getTime() > ate.getTime()) [de, ate] = [ate, de];
  return { de: ymd(de), ate: ymd(ate), gte: inicioDiaBrasilia(de), lt: inicioDiaBrasilia(addDias(ate, 1)) };
}

/** Querystring (sem "?") só com os parâmetros preenchidos, para links de exportação. */
export function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  return u.toString();
}
