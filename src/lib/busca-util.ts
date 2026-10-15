/** Partes puras da busca global (sem banco): validação da consulta e limite de requisições. */

export const BUSCA_MIN = 2;
export const BUSCA_MAX = 60;

/** Normaliza e valida o termo. Devolve null quando inválido (curto, longo ou só espaços). */
export function validarConsulta(bruto: string | null | undefined): string | null {
  if (typeof bruto !== "string") return null;
  const q = bruto.replace(/\s+/g, " ").trim();
  if (q.length < BUSCA_MIN || q.length > BUSCA_MAX) return null;
  return q;
}

/** Interpreta "PV-12", "pv12" ou só "12" como número inteiro seguro (até 9 dígitos). */
export function numeroDoDocumento(q: string, prefixo: string): number | null {
  const m = new RegExp(`^(?:${prefixo}[-\\s]?)?(\\d{1,9})$`, "i").exec(q.trim());
  if (!m) return null;
  // só o número puro (sem prefixo) também vale: o usuário costuma digitar apenas "12"
  return Number(m[1]);
}

/** Limitador em memória por chave: no máximo `max` chamadas a cada `janelaMs`. */
export function criarLimitador(max: number, janelaMs: number) {
  const mapa = new Map<string, number[]>();
  return function permitir(chave: string, agora = Date.now()): boolean {
    const recentes = (mapa.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (recentes.length >= max) {
      mapa.set(chave, recentes);
      return false;
    }
    recentes.push(agora);
    mapa.set(chave, recentes);
    if (mapa.size > 5000) for (const [k, v] of mapa) if (v.every((t) => agora - t >= janelaMs)) mapa.delete(k);
    return true;
  };
}
