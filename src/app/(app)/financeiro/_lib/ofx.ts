/**
 * Leitor de extrato OFX (v1 SGML e v2 XML). Função pura, sem acesso a banco.
 * Valores: crédito > 0, débito < 0. Datas viram meia-noite UTC do dia lançado.
 */

export type LinhaOfx = { fitid: string; data: Date; valor: number; descricao: string };

export const OFX_MAX_BYTES = 5 * 1024 * 1024;

/** Decodifica o arquivo: UTF-8 estrito; se falhar, windows-1252 (padrão dos bancos brasileiros). */
export function decodificarOfx(buf: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function tag(bloco: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/** "20261013", "20261013120000" ou "20261013120000[-3:BRT]" → Date UTC (dia). */
export function parseDataOfx(s: string | null): Date | null {
  const m = s ? /^(\d{4})(\d{2})(\d{2})/.exec(s) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // rejeita datas inexistentes (ex.: 20261345), que o Date "rola" para o mês seguinte
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

/** "1234.56", "-1.234,56" ou "-1234,56" → número com 2 casas; inválido → null. */
export function parseValorOfx(s: string | null): number | null {
  if (!s) return null;
  let t = s.replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); // formato brasileiro
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}

export type ResultadoOfx = { linhas: LinhaOfx[]; ignoradas: number };

export function lerOfx(texto: string): ResultadoOfx {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  const linhas: LinhaOfx[] = [];
  const usados = new Map<string, number>();
  let ignoradas = 0;

  for (const b of blocos) {
    const data = parseDataOfx(tag(b, "DTPOSTED"));
    const valor = parseValorOfx(tag(b, "TRNAMT"));
    if (!data || valor === null || valor === 0) {
      ignoradas++;
      continue;
    }
    const memo = tag(b, "MEMO");
    const nome = tag(b, "NAME");
    const descricao = (memo ?? nome ?? tag(b, "TRNTYPE") ?? "Sem descrição").replace(/\s+/g, " ").slice(0, 200);
    // sem FITID, monta um identificador estável a partir do conteúdo
    const base = (tag(b, "FITID") ?? `${data.toISOString().slice(0, 10)}|${valor.toFixed(2)}|${descricao}`).slice(0, 120);
    // FITID repetido no mesmo arquivo: sufixo sequencial, para não perder a linha
    const n = usados.get(base) ?? 0;
    usados.set(base, n + 1);
    linhas.push({ fitid: n === 0 ? base : `${base}#${n}`, data, valor, descricao });
  }
  return { linhas, ignoradas };
}
